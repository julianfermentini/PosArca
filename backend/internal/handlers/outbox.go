package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/models"
	"pos-fiscal/internal/pdf"
)

const (
	maxIntentosTarea = 5                // email: tras 5 fallos se deja la tarea en ERROR
	maxIntentosCAE   = 288              // obtener CAE: ~24h reintentando cada ~5min si ARCA está caído
	timeoutCAE       = 12 * time.Second // techo por intento de CAE: acota cuánto se retiene caeMu si ARCA cuelga
)

// errCAEBloqueadaPorOrden indica que esta venta espera su turno (orden estricto),
// no que haya fallado. El worker no debe gastarle intentos ni marcarla ERROR.
var errCAEBloqueadaPorOrden = errors.New("hay una venta anterior del mismo tipo todavía sin CAE")

// encolarTarea registra un efecto secundario pendiente (obtener CAE, imprimir, email).
// Se llama dentro de la misma transacción que crea la venta/factura, para que
// nunca pueda existir una sin su tarea asociada.
func encolarTarea(tx *gorm.DB, ventaID uuid.UUID, tipo models.TipoTarea) error {
	return tx.Create(&models.TareaPendiente{
		VentaID: ventaID,
		Tipo:    tipo,
		Estado:  models.TareaEstadoPendiente,
	}).Error
}

// solicitarCAE pide un CAE a ARCA para los montos y receptor dados. No toca la base:
// solo habla con AFIP/ARCA. Es el único lugar que arma los parámetros del pedido.
func solicitarCAE(ctx context.Context, db *gorm.DB, cfg *config.Config, iva, total float64, docNro int64, docTipo int) (*arca.ResultadoCAE, error) {
	cuitInt := parseCUIT(cfg.ArcaCUIT)
	token, sign, err := arca.GetToken(ctx, db, cuitInt, cfg.ArcaCertPath, cfg.ArcaKeyPath, cfg.ArcaEnv)
	if err != nil {
		return nil, err
	}

	tipoCmp := arca.TipoFacturaB
	condIVA := 5 // Consumidor Final
	if docTipo == arca.TipoDocCUIT {
		tipoCmp = arca.TipoFacturaA
		condIVA = 1 // IVA Responsable Inscripto
	}

	return arca.SolicitarCAE(ctx, arca.SolicitarCAEParams{
		CUIT:                   cuitInt,
		PuntoVenta:             cfg.ArcaPuntoVenta,
		TipoCmp:                tipoCmp,
		Fecha:                  time.Now(),
		Subtotal:               total - iva,
		IVA:                    iva,
		Total:                  total,
		DocTipoRec:             docTipo,
		DocNroRec:              docNro,
		CondicionIVAReceptorId: condIVA,
	}, token, sign, cfg.ArcaEnv)
}

// obtenerCAE consigue el CAE de una venta ya persistida y, si lo logra, guarda
// CAE/QR, autoriza la factura (si la venta es una factura) y encola el email
// (para facturas). Es idempotente: si la venta ya tiene CAE, no re-solicita
// ni re-encola. Devuelve el CAE para que el handler pueda responder al toque.
//
// La usan tanto el intento sincrónico al crear la venta como el worker al reintentar:
// si ARCA está caído en el primer intento, la venta queda registrada y el worker la
// vuelve a intentar hasta conseguirlo, sin perder nada.
func (w *Worker) obtenerCAE(ctx context.Context, ventaID uuid.UUID) (*arca.ResultadoCAE, error) {
	// caeMu serializa TODAS las solicitudes de CAE: dos pedidos concurrentes para la
	// misma venta darían dos CAE (doble numeración fiscal), y para ventas distintas
	// podrían pedir el mismo número de AFIP (FECompUltimoAutorizado+1 leído a la vez).
	// Las ventas de un POS son secuenciales, así que la contención es rara.
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

	// Orden estricto: no autorizar esta venta si hay una anterior del mismo tipo
	// (ticket vs. factura son secuencias separadas en ARCA) que todavía no tiene
	// CAE. Evita que ARCA autorice fuera de orden cronológico por procesar una
	// venta más nueva mientras una más vieja sigue reintentando.
	if bloqueada, err := w.hayAnteriorSinCAE(venta.Tipo, venta.CreatedAt, venta.ID); err != nil {
		return nil, fmt.Errorf("chequear orden: %w", err)
	} else if bloqueada {
		return nil, errCAEBloqueadaPorOrden
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
	cae, err := solicitarCAE(arcaCtx, w.db, w.cfg, iva, total, docNro, docTipo)
	cancel()
	if err != nil {
		return nil, err
	}

	// numeroFiscal es el número que ARCA autorizó de verdad (distinto del Numero
	// local/provisional) — es lo único que hay que imprimir/mostrar/poner en el QR
	// una vez que hay CAE, para que coincida con lo que ARCA tiene registrado.
	numeroFiscal := fmt.Sprintf("%03d-%08d", w.cfg.ArcaPuntoVenta, cae.NroCmp)

	// Persistir CAE/QR y encolar downstream en una sola transacción, para que nunca
	// quede un CAE sin las tareas que lo imprimen/emailean.
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
		}
		if esFactura {
			if err := encolarTarea(tx, ventaID, models.TareaEmailFactura); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("persistir CAE: %w", err)
	}
	return cae, nil
}

// hayAnteriorSinCAE indica si existe otra venta del mismo tipo, creada antes que
// createdAt, cuya tarea de CAE sigue pendiente o en error (no cancelada, no hecha).
func (w *Worker) hayAnteriorSinCAE(tipo models.TipoComprobante, createdAt time.Time, ventaID uuid.UUID) (bool, error) {
	var count int64
	err := w.db.Model(&models.TareaPendiente{}).
		Joins("JOIN ventas ON ventas.id = tareas_pendientes.venta_id").
		Where("tareas_pendientes.tipo = ?", models.TareaObtenerCAE).
		Where("tareas_pendientes.estado IN ?", []models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}).
		Where("ventas.tipo = ? AND ventas.id != ?", tipo, ventaID).
		Where("ventas.created_at < ? OR (ventas.created_at = ? AND ventas.id < ?)", createdAt, createdAt, ventaID).
		Count(&count).Error
	return count > 0, err
}

// AnularCAE cancela para siempre la tarea de CAE de una venta trabada — deja de
// reintentarla y libera el orden estricto para las ventas siguientes del mismo
// tipo. Si es una factura, además la marca en estado ERROR.
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
	// Destraba la cola: la siguiente venta del mismo tipo ya no tiene por qué esperar.
	go w.procesarPendientes(context.Background())
	return nil
}

// CorregirYReintentarFactura actualiza los datos del cliente de una factura
// trabada (ej. CUIT mal tipeado) y reencola su tarea de CAE para reintentar ya.
func (w *Worker) CorregirYReintentarFactura(ventaID uuid.UUID, razonSocial, cuit, email string) error {
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
			"email_cliente": email,
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

// enviarFacturaPorEmail genera el PDF de la factura y lo manda por email. Carga
// venta y factura frescas desde la base para poder correr como tarea diferida,
// sin depender de objetos en memoria de la request original.
func enviarFacturaPorEmail(db *gorm.DB, cfg *config.Config, emailCli *email.Cliente, ventaID uuid.UUID) error {
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

	emp := getEmpresaConf(db, cfg)
	_, iva, total := models.TotalesDeItems(venta.Items)

	// Factura A si el cliente tiene CUIT válido (responsable inscripto),
	// Factura B si es consumidor final — mismo criterio que la emisión del CAE.
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
		NegocioNombre:     emp.RazonSocial,
		NegocioDirec:      emp.Direccion,
		NegocioTel:        emp.Telefono,
		NegocioIVACond:    emp.CondicionIVA,
		CUIT:              emp.CUIT,
		PuntoVenta:        emp.PuntoVenta,
		IngBrutos:         emp.IngBrutos,
		InicioActividades: emp.InicioActividades,
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
		MetodoPago:        string(venta.MetodoPago),
		CAE:               factura.CAE,
		CAEVto:            caeVto,
		DefensaConsumidor: emp.DefensaConsumidor,
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
		NegocioNombre: emp.RazonSocial,
	}
	if err := emailCli.EnviarFactura(ctx, factura.EmailCliente, datosEmail); err != nil {
		return fmt.Errorf("enviar email: %w", err)
	}

	return db.Model(&factura).Update("email_enviado", true).Error
}

// Worker procesa las tareas pendientes (CAE, email) en background, con
// reintentos, para que un reinicio a mitad de camino no pierda un efecto
// secundario silenciosamente.
type Worker struct {
	db       *gorm.DB
	cfg      *config.Config
	emailCli *email.Cliente
	caeMu    sync.Mutex // serializa las solicitudes de CAE (evita doble CAE / carreras de numeración AFIP)
	sweepMu  sync.Mutex // coalesce de barridos concurrentes (evita procesar la misma tarea dos veces)
}

func NuevoWorker(db *gorm.DB, cfg *config.Config, emailCli *email.Cliente) *Worker {
	return &Worker{db: db, cfg: cfg, emailCli: emailCli}
}

// Iniciar corre el worker hasta que ctx se cancele. La primera pasada ocurre de
// inmediato (retoma lo que haya quedado de un reinicio anterior), sin esperar
// el primer tick del intervalo.
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
	// Si ya hay un barrido corriendo, no arranco otro: el que corre procesará lo que
	// se acabe de encolar. Evita que dos barridos ejecuten la misma tarea dos veces.
	if !w.sweepMu.TryLock() {
		return
	}
	defer w.sweepMu.Unlock()

	var tareas []models.TareaPendiente
	err := w.db.WithContext(ctx).
		Where("estado IN ?", []models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}).
		Order("created_at ASC"). // cronológico: las ventas más viejas consiguen CAE primero
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

	// Limpieza: una tarea HECHA es solo un registro de que el efecto ya ocurrió;
	// pasados 30 días no la mira nadie y sin esto la tabla crece para siempre
	// (1–2 filas por venta). Las CANCELADA se conservan: son el único registro
	// de una anulación manual y de su motivo.
	if err := w.db.WithContext(ctx).
		Where("estado = ? AND updated_at < ?", models.TareaEstadoHecha, time.Now().AddDate(0, 0, -30)).
		Delete(&models.TareaPendiente{}).Error; err != nil {
		slog.Warn("outbox: limpiar tareas hechas viejas", "err", err)
	}
}

// maxIntentos define cuántas veces reintentar según el tipo: obtener el CAE se
// reintenta durante horas (ARCA puede estar caído un buen rato), mientras que
// imprimir/email se abandonan tras unos pocos intentos.
func maxIntentos(tipo models.TipoTarea) int {
	if tipo == models.TareaObtenerCAE {
		return maxIntentosCAE
	}
	return maxIntentosTarea
}

// tareaLista aplica backoff exponencial (cap 5min) desde el último intento, para
// no martillar a ARCA en cada poll cuando una tarea viene fallando.
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
		err = enviarFacturaPorEmail(w.db, w.cfg, w.emailCli, t.VentaID)
	default:
		err = fmt.Errorf("tipo de tarea desconocido: %s", t.Tipo)
	}

	if err != nil {
		if errors.Is(err, errCAEBloqueadaPorOrden) {
			// No es una falla — está esperando su turno. No gastar intentos ni
			// marcar ERROR: se reintenta en el próximo poll sin penalizarla.
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
