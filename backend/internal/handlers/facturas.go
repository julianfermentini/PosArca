package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/arca"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/impresora"
	"pos-fiscal/internal/models"
	"pos-fiscal/internal/pdf"
)

type FacturasHandler struct {
	db       *gorm.DB
	cfg      *config.Config
	imp      *impresora.Impresora
	emailCli *email.Cliente
}

func NuevoFacturasHandler(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora, emailCli *email.Cliente) *FacturasHandler {
	return &FacturasHandler{db: db, cfg: cfg, imp: imp, emailCli: emailCli}
}

type CrearFacturaRequest struct {
	Items        []models.ItemRequest `json:"items" binding:"required,min=1"`
	MetodoPago   models.MetodoPago    `json:"metodo_pago" binding:"required,oneof=EFECTIVO TARJETA BILLETERA"`
	RazonSocial  string               `json:"razon_social" binding:"required"`
	CUITCliente  string               `json:"cuit_cliente" binding:"required"`
	EmailCliente string               `json:"email_cliente" binding:"required,email"`
}

// Crear maneja POST /api/facturas
func (h *FacturasHandler) Crear(c *gin.Context) {
	var req CrearFacturaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	vh := &VentasHandler{db: h.db, cfg: h.cfg, impresora: h.imp}

	var ventaID uuid.UUID
	var numero string

	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		numero, err = siguienteNumero(tx, models.TipoFactura, h.cfg.ArcaPuntoVenta)
		if err != nil {
			return err
		}

		ventaID = uuid.New()
		venta := models.Venta{
			ID:         ventaID,
			Tipo:       models.TipoFactura,
			Numero:     numero,
			MetodoPago: req.MetodoPago,
		}
		if err := tx.Create(&venta).Error; err != nil {
			return err
		}

		for i, itemReq := range req.Items {
			item := models.NuevoVentaItem(ventaID, itemReq, i)
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	var venta models.Venta
	h.db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).First(&venta, "id = ?", ventaID)

	_, iva, total := models.TotalesDeItems(venta.Items)

	docNro := parseCUIT(req.CUITCliente)
	docTipo := arca.TipoDocConsumidorFinal
	if docNro > 0 {
		docTipo = arca.TipoDocCUIT
	}

	caeResult, err := vh.solicitarCAE(ctx, ventaID, iva, total, venta.Items, docNro, docTipo)
	if err != nil {
		slog.Error("CAE factura", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error CAE: " + err.Error()})
		return
	}

	factura := models.Factura{
		ID:           uuid.New(),
		VentaID:      ventaID,
		RazonSocial:  req.RazonSocial,
		CUITCliente:  req.CUITCliente,
		EmailCliente: req.EmailCliente,
		CAE:          caeResult.CAE,
		Estado:       models.EstadoAutorizado,
	}
	fchVto := caeResult.FchVto
	factura.CAEVto = &fchVto

	if err := h.db.Create(&factura).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error guardando factura"})
		return
	}

	go h.procesarBackground(venta, factura, caeResult, total)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":            factura.ID,
			"venta_id":      ventaID,
			"numero":        numero,
			"cae":           caeResult.CAE,
			"cae_vto":       caeResult.FchVto.Format("2006-01-02"),
			"total":         total,
			"email_enviado": false,
		},
	})
}

// Listar maneja GET /api/facturas
func (h *FacturasHandler) Listar(c *gin.Context) {
	var facturas []models.Factura
	if err := h.db.Preload("Venta.Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("orden ASC")
	}).Order("created_at desc").Limit(100).Find(&facturas).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": facturas})
}

func (h *FacturasHandler) procesarBackground(venta models.Venta, factura models.Factura, cae *arca.ResultadoCAE, total float64) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	vh := &VentasHandler{db: h.db, cfg: h.cfg, impresora: h.imp}
	vh.imprimirTicket(venta, cae)

	// Leer config del negocio desde la BD (con fallback a .env)
	emp := getEmpresaConf(h.db, h.cfg)

	// Generar PDF
	_, iva, _ := models.TotalesDeItems(venta.Items)

	// Factura A si el cliente tiene CUIT válido (responsable inscripto),
	// Factura B si es consumidor final — mismo criterio que la emisión del CAE.
	letra := "B"
	tipoComp := "Factura B"
	condIVACliente := "Consumidor Final"
	if parseCUIT(factura.CUITCliente) > 0 {
		letra = "A"
		tipoComp = "Factura A"
		condIVACliente = "Responsable Inscripto"
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

	datosPDF := pdf.DatosFacturaPDF{
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
	}

	pdfBytes, err := pdf.Generar(datosPDF)
	if err != nil {
		slog.Error("generar pdf factura", "err", err, "numero", venta.Numero)
	}

	datosEmail := email.DatosFactura{
		RazonSocial:   factura.RazonSocial,
		CUIT:          factura.CUITCliente,
		Numero:        venta.Numero,
		Total:         total,
		CAE:           factura.CAE,
		PDFBytes:      pdfBytes,
		NegocioNombre: emp.RazonSocial,
	}

	if err := h.emailCli.EnviarFactura(ctx, factura.EmailCliente, datosEmail); err != nil {
		slog.Error("enviar email factura", "err", err)
		return
	}

	h.db.Model(&factura).Update("email_enviado", true)
}
