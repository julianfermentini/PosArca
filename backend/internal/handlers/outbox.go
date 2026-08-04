package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/models"
	"pos-fiscal/internal/pdf"
)

const (
	maxIntentosTarea = 5
	maxIntentosCAE   = 288
	timeoutCAE       = 12 * time.Second

	alertaTrasIntentos = 5                // tareas de CAE con >= N intentos se consideran trabadas
	alertaThrottle     = 30 * time.Minute // no repetir la alerta más seguido que esto
)

var errCAEBloqueadaPorOrden = errors.New("hay una venta anterior del mismo tipo todavía sin CAE")

// encolarTarea registra un efecto secundario pendiente en la misma transacción
// que crea la venta/factura, garantizando que nunca exista una sin su tarea.
func encolarTarea(tx *gorm.DB, ventaID, empresaID uuid.UUID, tipo models.TipoTarea) error {
	return tx.Create(&models.TareaPendiente{
		VentaID:   ventaID,
		EmpresaID: empresaID,
		Tipo:      tipo,
		Estado:    models.TareaEstadoPendiente,
	}).Error
}

// solicitarCAE pide un CAE a ARCA usando la configuración de la empresa. No toca
// la base: solo habla con AFIP/ARCA. Es el único lugar que arma los parámetros.
func solicitarCAE(ctx context.Context, db *gorm.DB, empresa models.ConfigEmpresa, iva, total float64, docNro int64, docTipo int) (*arca.ResultadoCAE, error) {
	cuitInt := parseCUIT(empresa.CUIT)
	token, sign, err := arca.GetToken(ctx, db, cuitInt, empresa.CertPEM, empresa.KeyPEM, empresa.ArcaEnv)
	if err != nil {
		return nil, err
	}

	tipoCmp := arca.TipoFacturaB
	condIVA := 5
	if docTipo == arca.TipoDocCUIT {
		tipoCmp = arca.TipoFacturaA
		condIVA = 1
	}

	return arca.SolicitarCAE(ctx, arca.SolicitarCAEParams{
		CUIT:                   cuitInt,
		PuntoVenta:             empresa.PuntoVenta,
		TipoCmp:                tipoCmp,
		Fecha:                  time.Now(),
		Subtotal:               total - iva,
		IVA:                    iva,
		Total:                  total,
		DocTipoRec:             docTipo,
		DocNroRec:              docNro,
		CondicionIVAReceptorId: condIVA,
	}, token, sign, empresa.ArcaEnv)
}

// obtenerCAE consigue el CAE de una venta ya persistida, cargando la empresa
// desde la base para saber qué CUIT/certs usar. Es idempotente.
func (w *Worker) obtenerCAE(ctx context.Context, ventaID uuid.UUID) (*arca.ResultadoCAE, error) {
	w.caeMu.Lock()
	defer w.caeMu.Unlock()

	var venta models.Venta
	if err := w.db.Preload("Items", func(d *gorm.DB) *gorm.DB {
		return d.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID).Error; err != nil {
		return nil, fmt.Errorf("cargar venta: %w", err)
	}

	if venta.CAE != "" {
		var vto time.Time
		if venta.CAEVto != nil {
			vto = *venta.CAEVto
		}
		return &arca.ResultadoCAE{CAE: venta.CAE, FchVto: vto, QRData: venta.QRData}, nil
	}

	if bloqueada, err := w.hayAnteriorSinCAE(venta.Tipo, venta.EmpresaID, venta.CreatedAt, venta.ID); err != nil {
		return nil, fmt.Errorf("chequear orden: %w", err)
	} else if bloqueada {
		return nil, errCAEBloqueadaPorOrden
	}

	empresa, err := loadEmpresa(w.db, venta.EmpresaID)
	if err != nil {
		return nil, fmt.Errorf("cargar empresa: %w", err)
	}

	docNro, docTipo := int64(0), arca.TipoDocConsumidorFinal
	esFactura := venta.Tipo == models.TipoFactura
	if esFactura {
		var factura models.Factura
		if err := w.db.First(&factura, "venta_id = ?", ventaID).Error; err != nil {
			return nil, fmt.Errorf("cargar factura: %w", err)
		}
		if docNro = parseCUIT(factura.CUITCliente); docNro > 0 {
			docTipo = arca.TipoDocCUIT
		}
	}

	_, iva, total := models.TotalesDeItems(venta.Items)
	arcaCtx, cancel := context.WithTimeout(ctx, timeoutCAE)
	cae, err := solicitarCAE(arcaCtx, w.db, empresa, iva, total, docNro, docTipo)
	cancel()
	if err != nil {
		return nil, err
	}

	numeroFiscal := fmt.Sprintf("%03d-%08d", empresa.PuntoVenta, cae.NroCmp)

	err = w.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Venta{}).Where("id = ?", ventaID).Updates(map[string]interface{}{
			"numero_fiscal": numeroFiscal,
			"cae":           cae.CAE,
			"cae_vto":       &cae.FchVto,
			"qr_data":       cae.QRData,
		}).Error; err != nil {
			return err
		}
		if esFactura {
			if err := tx.Model(&models.Factura{}).Where("venta_id = ?", ventaID).Updates(map[string]interface{}{
				"cae":     cae.CAE,
				"cae_vto": &cae.FchVto,
				"estado":  models.EstadoAutorizado,
			}).Error; err != nil {
				return err
			}
			return encolarTarea(tx, ventaID, venta.EmpresaID, models.TareaEmailFactura)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("persistir CAE: %w", err)
	}
	return cae, nil
}

// hayAnteriorSinCAE indica si hay otra venta del mismo tipo y empresa, anterior,
// cuya tarea de CAE sigue pendiente o en error.
func (w *Worker) hayAnteriorSinCAE(tipo models.TipoComprobante, empresaID uuid.UUID, createdAt time.Time, ventaID uuid.UUID) (bool, error) {
	var count int64
	err := w.db.Model(&models.TareaPendiente{}).
		Joins("JOIN ventas ON ventas.id = tareas_pendientes.venta_id").
		Where("tareas_pendientes.tipo = ?", models.TareaObtenerCAE).
		Where("tareas_pendientes.estado IN ?", []models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}).
		Where("ventas.tipo = ? AND ventas.empresa_id = ? AND ventas.id != ?", tipo, empresaID, ventaID).
		Where("ventas.created_at < ? OR (ventas.created_at = ? AND ventas.id < ?)", createdAt, createdAt, ventaID).
		Count(&count).Error
	return count > 0, err
}

// AnularCAE cancela para siempre la tarea de CAE de una venta trabada.
func (w *Worker) AnularCAE(ventaID uuid.UUID, motivo string) error {
	err := w.db.Transaction(func(tx *gorm.DB) error {
		var venta models.Venta
		if err := tx.First(&venta, "id = ?", ventaID).Error; err != nil {
			return fmt.Errorf("cargar venta: %w", err)
		}
		if venta.CAE != "" {
			return fmt.Errorf("la venta ya tiene CAE, no hay nada que anular")
		}
		if err := tx.Model(&models.TareaPendiente{}).
			Where("venta_id = ? AND tipo = ?", ventaID, models.TareaObtenerCAE).
			Updates(map[string]interface{}{"estado": models.TareaEstadoCancelada, "ultimo_error": motivo}).Error; err != nil {
			return err
		}
		if venta.Tipo == models.TipoFactura {
			return tx.Model(&models.Factura{}).Where("venta_id = ?", ventaID).Update("estado", models.EstadoError).Error
		}
		return nil
	})
	if err != nil {
		return err
	}
	go w.procesarPendientes(context.Background())
	return nil
}

// CorregirYReintentarFactura actualiza los datos del cliente y reencola el CAE.
func (w *Worker) CorregirYReintentarFactura(ventaID uuid.UUID, razonSocial, cuit, emailAddr string) error {
	err := w.db.Transaction(func(tx *gorm.DB) error {
		var venta models.Venta
		if err := tx.First(&venta, "id = ?", ventaID).Error; err != nil {
			return fmt.Errorf("cargar venta: %w", err)
		}
		if venta.CAE != "" {
			return fmt.Errorf("la factura ya tiene CAE")
		}
		if venta.Tipo != models.TipoFactura {
			return fmt.Errorf("esta venta no es una factura")
		}
		if err := tx.Model(&models.Factura{}).Where("venta_id = ?", ventaID).Updates(map[string]interface{}{
			"razon_social":  razonSocial,
			"cuit_cliente":  cuit,
			"email_cliente": emailAddr,
		}).Error; err != nil {
			return err
		}
		return tx.Model(&models.TareaPendiente{}).
			Where("venta_id = ? AND tipo = ?", ventaID, models.TareaObtenerCAE).
			Updates(map[string]interface{}{"estado": models.TareaEstadoPendiente, "intentos": 0, "ultimo_error": ""}).Error
	})
	if err != nil {
		return err
	}
	go w.procesarPendientes(context.Background())
	return nil
}

// enviarFacturaPorEmail genera el PDF y lo envía. Carga venta, factura y empresa
// frescos desde la base para poder correr como tarea diferida.
func enviarFacturaPorEmail(db *gorm.DB, emailCli *email.Cliente, ventaID uuid.UUID) error {
	var venta models.Venta
	if err := db.Preload("Items", func(d *gorm.DB) *gorm.DB {
		return d.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID).Error; err != nil {
		return fmt.Errorf("cargar venta: %w", err)
	}

	var factura models.Factura
	if err := db.First(&factura, "venta_id = ?", ventaID).Error; err != nil {
		return fmt.Errorf("cargar factura: %w", err)
	}

	empresa, err := loadEmpresa(db, venta.EmpresaID)
	if err != nil {
		return fmt.Errorf("cargar empresa: %w", err)
	}

	_, iva, total := models.TotalesDeItems(venta.Items)

	letra, tipoComp, condIVACliente := "B", "Factura B", "Consumidor Final"
	if parseCUIT(factura.CUITCliente) > 0 {
		letra, tipoComp, condIVACliente = "A", "Factura A", "Responsable Inscripto"
	}

	items := make([]pdf.ItemPDF, len(venta.Items))
	for i, it := range venta.Items {
		items[i] = pdf.ItemPDF{
			Descripcion:   it.Descripcion,
			PrecioNeto:    it.PrecioNeto,
			IVAPorcentaje: 21,
			Cantidad:      it.Cantidad,
			Total:         it.Total,
		}
	}

	var caeVto time.Time
	if factura.CAEVto != nil {
		caeVto = *factura.CAEVto
	}

	pdfBytes, err := pdf.Generar(pdf.DatosFacturaPDF{
		NegocioNombre:     empresa.RazonSocial,
		NegocioDirec:      empresa.Direccion,
		NegocioTel:        empresa.Telefono,
		NegocioIVACond:    empresa.CondicionIVA,
		CUIT:              empresa.CUIT,
		PuntoVenta:        empresa.PuntoVenta,
		IngBrutos:         empresa.IngBrutos,
		InicioActividades: empresa.InicioActividades,
		Numero:            venta.NumeroFiscal,
		Fecha:             venta.CreatedAt,
		TipoComp:          tipoComp,
		LetraComp:         letra,
		RazonSocial:       factura.RazonSocial,
		CUITCliente:       factura.CUITCliente,
		EmailCliente:      factura.EmailCliente,
		CondIVACliente:    condIVACliente,
		Items:             items,
		Subtotal:          total - iva,
		IVA:               iva,
		Total:             total,
		MontoEfectivo:     venta.MontoEfectivo,
		MontoTarjeta:      venta.MontoTarjeta,
		MontoBilletera:    venta.MontoBilletera,
		CAE:               factura.CAE,
		CAEVto:            caeVto,
		DefensaConsumidor: empresa.DefensaConsumidor,
		QRData:            venta.QRData,
	})
	if err != nil {
		return fmt.Errorf("generar pdf: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	datosEmail := email.DatosFactura{
		RazonSocial:   factura.RazonSocial,
		CUIT:          factura.CUITCliente,
		Numero:        venta.NumeroFiscal,
		Total:         total,
		CAE:           factura.CAE,
		PDFBytes:      pdfBytes,
		NegocioNombre: empresa.RazonSocial,
	}
	if err := emailCli.EnviarFactura(ctx, factura.EmailCliente, datosEmail); err != nil {
		return fmt.Errorf("enviar email: %w", err)
	}

	return db.Model(&factura).Update("email_enviado", true).Error
}

// Worker procesa las tareas pendientes (CAE, email) en background.
type Worker struct {
	db           *gorm.DB
	emailCli     *email.Cliente
	alertEmail   string
	caeMu        sync.Mutex
	sweepMu      sync.Mutex
	ultimaAlerta time.Time // protegido por sweepMu: chequearAlerta corre siempre dentro del sweep
}

func NuevoWorker(db *gorm.DB, emailCli *email.Cliente, alertEmail string) *Worker {
	return &Worker{db: db, emailCli: emailCli, alertEmail: alertEmail}
}

func (w *Worker) Iniciar(ctx context.Context, intervalo time.Duration) {
	w.procesarPendientes(ctx)

	ticker := time.NewTicker(intervalo)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.procesarPendientes(ctx)
		}
	}
}

func (w *Worker) procesarPendientes(ctx context.Context) {
	if !w.sweepMu.TryLock() {
		return
	}
	defer w.sweepMu.Unlock()

	var tareas []models.TareaPendiente
	err := w.db.WithContext(ctx).
		Where("estado IN ?", []models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}).
		Order("created_at ASC").
		Find(&tareas).Error
	if err != nil {
		slog.Error("outbox: leer tareas pendientes", "err", err)
		return
	}

	for _, t := range tareas {
		if t.Intentos >= maxIntentos(t.Tipo) || !tareaLista(t) {
			continue
		}
		w.ejecutar(ctx, t)
	}

	w.chequearAlerta(ctx)

	if err := w.db.WithContext(ctx).
		Where("estado = ? AND updated_at < ?", models.TareaEstadoHecha, time.Now().AddDate(0, 0, -30)).
		Delete(&models.TareaPendiente{}).Error; err != nil {
		slog.Warn("outbox: limpiar tareas hechas viejas", "err", err)
	}
}

// chequearAlerta avisa por email si hay comprobantes que no consiguen CAE tras
// varios intentos — la señal de que ARCA está caído, el certificado venció o el
// punto de venta no está habilitado. Manda UN solo mail por ventana (no uno por
// tarea, para no generar una tormenta durante un apagón de ARCA) y lo repite cada
// alertaThrottle mientras el problema siga. Corre siempre dentro del sweep
// (bajo sweepMu), así que el acceso a ultimaAlerta no necesita lock propio.
func (w *Worker) chequearAlerta(ctx context.Context) {
	if w.alertEmail == "" {
		return // alertas deshabilitadas
	}

	var trabadas []models.TareaPendiente
	if err := w.db.WithContext(ctx).
		Where("tipo = ? AND estado = ? AND intentos >= ?", models.TareaObtenerCAE, models.TareaEstadoError, alertaTrasIntentos).
		Order("created_at ASC").
		Find(&trabadas).Error; err != nil {
		slog.Error("outbox: consultar tareas trabadas para alerta", "err", err)
		return
	}
	if len(trabadas) == 0 || time.Since(w.ultimaAlerta) < alertaThrottle {
		return
	}
	// Marcamos ANTES de enviar: si el envío falla igual respetamos el throttle
	// (el próximo intento es en alertaThrottle) en vez de reintentar cada 5s. El
	// problema de fondo sigue siendo visible en la pantalla de Pendientes.
	w.ultimaAlerta = time.Now()

	masVieja := trabadas[0]
	empresa, _ := loadEmpresa(w.db, masVieja.EmpresaID)
	var venta models.Venta
	w.db.First(&venta, "id = ?", masVieja.VentaID)

	asunto, cuerpo := mensajeAlertaCAE(len(trabadas), venta, empresa.RazonSocial, masVieja)

	alertCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := w.emailCli.EnviarAlerta(alertCtx, w.alertEmail, asunto, cuerpo); err != nil {
		slog.Error("outbox: no se pudo enviar la alerta de CAE trabado", "err", err)
	} else {
		slog.Warn("outbox: alerta de CAE trabado enviada", "cantidad", len(trabadas), "destino", w.alertEmail)
	}
}

// mensajeAlertaCAE arma el asunto y el cuerpo del email de alerta. Función pura
// (sin DB ni red) para poder testear el formato.
func mensajeAlertaCAE(cantidad int, masVieja models.Venta, razonSocial string, tarea models.TareaPendiente) (asunto, cuerpo string) {
	asunto = fmt.Sprintf("[PosArca] %d comprobante(s) sin CAE", cantidad)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Hay %d comprobante(s) que no consiguen CAE de ARCA tras %d o más intentos.\n\n", cantidad, alertaTrasIntentos))
	sb.WriteString("Causas típicas: ARCA/AFIP caído, certificado vencido, o punto de venta no habilitado.\n\n")
	sb.WriteString("--- MÁS ANTIGUO ---\n")
	if razonSocial != "" {
		sb.WriteString(fmt.Sprintf("Empresa:      %s\n", razonSocial))
	}
	sb.WriteString(fmt.Sprintf("Venta:        %s\n", masVieja.Numero))
	sb.WriteString(fmt.Sprintf("Intentos:     %d\n", tarea.Intentos))
	if tarea.UltimoError != "" {
		sb.WriteString(fmt.Sprintf("Último error: %s\n", tarea.UltimoError))
	}
	sb.WriteString("-------------------\n\n")
	sb.WriteString("Revisá la pantalla de Pendientes ARCA o los logs del servidor.\n")
	sb.WriteString(fmt.Sprintf("Esta alerta se repite cada %s mientras haya comprobantes trabados.\n", alertaThrottle))
	return asunto, sb.String()
}

func maxIntentos(tipo models.TipoTarea) int {
	if tipo == models.TareaObtenerCAE {
		return maxIntentosCAE
	}
	return maxIntentosTarea
}

func tareaLista(t models.TareaPendiente) bool {
	return time.Since(t.UpdatedAt) >= backoff(t.Intentos)
}

func backoff(intentos int) time.Duration {
	if intentos <= 0 {
		return 0
	}
	if intentos > 20 {
		return 5 * time.Minute
	}
	if d := 5 * time.Second << uint(intentos-1); d < 5*time.Minute {
		return d
	}
	return 5 * time.Minute
}

func (w *Worker) ejecutar(ctx context.Context, t models.TareaPendiente) {
	var err error
	switch t.Tipo {
	case models.TareaObtenerCAE:
		_, err = w.obtenerCAE(ctx, t.VentaID)
	case models.TareaEmailFactura:
		err = enviarFacturaPorEmail(w.db, w.emailCli, t.VentaID)
	default:
		err = fmt.Errorf("tipo de tarea desconocido: %s", t.Tipo)
	}

	if err != nil {
		if errors.Is(err, errCAEBloqueadaPorOrden) {
			return
		}
		slog.Error("outbox: tarea falló", "tipo", t.Tipo, "venta_id", t.VentaID, "intento", t.Intentos+1, "err", err)
		w.db.Model(&t).Updates(map[string]interface{}{
			"estado":       models.TareaEstadoError,
			"intentos":     t.Intentos + 1,
			"ultimo_error": err.Error(),
		})
		return
	}

	w.db.Model(&t).Update("estado", models.TareaEstadoHecha)
}
