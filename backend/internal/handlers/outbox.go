package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/impresora"
	"pos-fiscal/internal/models"
	"pos-fiscal/internal/pdf"
)

const maxIntentosTarea = 5

// encolarTarea registra un efecto secundario pendiente (imprimir, enviar email).
// Se llama dentro de la misma transacción que crea la venta/factura, para que
// nunca pueda existir una sin su tarea asociada.
func encolarTarea(tx *gorm.DB, ventaID uuid.UUID, tipo models.TipoTarea) error {
	return tx.Create(&models.TareaPendiente{
		VentaID: ventaID,
		Tipo:    tipo,
		Estado:  models.TareaEstadoPendiente,
	}).Error
}

// PersistirCAEYEncolar guarda el CAE/QR obtenidos de ARCA en la venta y encola las
// tareas indicadas en una única transacción, para que nunca quede un CAE persistido
// sin la tarea que lo va a imprimir/emailear. Si se encola con éxito, empuja al
// worker para procesar ya — el poll periódico queda solo como red de seguridad.
func (w *Worker) PersistirCAEYEncolar(ventaID uuid.UUID, cae *arca.ResultadoCAE, tareas ...models.TipoTarea) error {
	err := w.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Venta{}).Where("id = ?", ventaID).Updates(map[string]interface{}{
			"cae":     cae.CAE,
			"cae_vto": &cae.FchVto,
			"qr_data": cae.QRData,
		}).Error; err != nil {
			return err
		}
		for _, tipo := range tareas {
			if err := encolarTarea(tx, ventaID, tipo); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("persistir CAE y encolar tareas: %w", err)
	}
	go w.procesarPendientes(context.Background())
	return nil
}

// imprimirTicket imprime el ticket por el puerto serie configurado (despliegue
// Linux/Raspberry Pi). En el resto de los despliegues la impresión la maneja el
// frontend vía WebUSB/Bluetooth, así que esto es un no-op.
func imprimirTicket(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora, venta models.Venta) error {
	if !imp.EstaConfigurada() {
		return nil
	}

	ticketItems := make([]impresora.ItemTicket, len(venta.Items))
	for i, it := range venta.Items {
		ticketItems[i] = impresora.ItemTicket{
			Descripcion: it.Descripcion,
			PrecioNeto:  it.PrecioNeto,
			Total:       it.Total,
		}
	}

	subtotal, iva, total := models.TotalesDeItems(venta.Items)
	emp := getEmpresaConf(db, cfg)

	var caeVto time.Time
	if venta.CAEVto != nil {
		caeVto = *venta.CAEVto
	}

	datos := impresora.DatosTicket{
		RazonSocial: emp.RazonSocial,
		CUIT:        cfg.ArcaCUIT,
		PuntoVenta:  cfg.ArcaPuntoVenta,
		TipoCmp:     string(venta.Tipo),
		Numero:      venta.Numero,
		Fecha:       venta.CreatedAt,
		Items:       ticketItems,
		Subtotal:    subtotal,
		IVA:         iva,
		Total:       total,
		MetodoPago:  string(venta.MetodoPago),
		CAE:         venta.CAE,
		CAEVto:      caeVto,
		QRBase64:    venta.QRData,
	}

	escpos, err := impresora.GenerarESCPOS(datos)
	if err != nil {
		return fmt.Errorf("generar ESC/POS: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := imp.Imprimir(ctx, escpos); err != nil {
		return fmt.Errorf("imprimir ticket: %w", err)
	}

	return db.Model(&venta).Update("impreso", true).Error
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
			Total:         it.Total,
		}
	}

	var caeVto time.Time
	if factura.CAEVto != nil {
		caeVto = *factura.CAEVto
	}

	pdfBytes, err := pdf.Generar(pdf.DatosFacturaPDF{
		NegocioNombre:  emp.RazonSocial,
		NegocioDirec:   emp.Direccion,
		NegocioTel:     emp.Telefono,
		NegocioIVACond: emp.CondicionIVA,
		CUIT:           emp.CUIT,
		PuntoVenta:     emp.PuntoVenta,
		Numero:         venta.Numero,
		Fecha:          venta.CreatedAt,
		TipoComp:       tipoComp,
		LetraComp:      letra,
		RazonSocial:    factura.RazonSocial,
		CUITCliente:    factura.CUITCliente,
		EmailCliente:   factura.EmailCliente,
		CondIVACliente: condIVACliente,
		Items:          items,
		Subtotal:       total - iva,
		IVA:            iva,
		Total:          total,
		MetodoPago:     string(venta.MetodoPago),
		CAE:            factura.CAE,
		CAEVto:         caeVto,
	})
	if err != nil {
		return fmt.Errorf("generar pdf: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	datosEmail := email.DatosFactura{
		RazonSocial:   factura.RazonSocial,
		CUIT:          factura.CUITCliente,
		Numero:        venta.Numero,
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

// Worker procesa las tareas pendientes (imprimir, email) en background, con
// reintentos, para que un reinicio a mitad de camino no pierda un efecto
// secundario silenciosamente.
type Worker struct {
	db       *gorm.DB
	cfg      *config.Config
	imp      *impresora.Impresora
	emailCli *email.Cliente
}

func NuevoWorker(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora, emailCli *email.Cliente) *Worker {
	return &Worker{db: db, cfg: cfg, imp: imp, emailCli: emailCli}
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
	var tareas []models.TareaPendiente
	err := w.db.WithContext(ctx).
		Where("estado IN ? AND intentos < ?",
			[]models.EstadoTarea{models.TareaEstadoPendiente, models.TareaEstadoError}, maxIntentosTarea).
		Find(&tareas).Error
	if err != nil {
		slog.Error("outbox: leer tareas pendientes", "err", err)
		return
	}

	for _, t := range tareas {
		w.ejecutar(t)
	}
}

func (w *Worker) ejecutar(t models.TareaPendiente) {
	var err error
	switch t.Tipo {
	case models.TareaImprimir:
		err = w.ejecutarImprimir(t.VentaID)
	case models.TareaEmailFactura:
		err = enviarFacturaPorEmail(w.db, w.cfg, w.emailCli, t.VentaID)
	default:
		err = fmt.Errorf("tipo de tarea desconocido: %s", t.Tipo)
	}

	if err != nil {
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

func (w *Worker) ejecutarImprimir(ventaID uuid.UUID) error {
	var venta models.Venta
	if err := w.db.Preload("Items", func(d *gorm.DB) *gorm.DB {
		return d.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID).Error; err != nil {
		return fmt.Errorf("cargar venta: %w", err)
	}
	return imprimirTicket(w.db, w.cfg, w.imp, venta)
}
