package handlers

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	// tzdata embebe la base IANA en el binario — sin esto, time.LoadLocation
	// puede fallar si el contenedor no trae el paquete de sistema tzdata.
	_ "time/tzdata"

	"pos-fiscal/internal/models"
)

// internalError loguea el error real server-side (con método y ruta para
// poder ubicarlo) y devuelve un mensaje genérico al cliente — evita filtrar
// detalle interno de Postgres/GORM (nombres de columna, constraints, etc.)
// en la respuesta HTTP.
func internalError(c *gin.Context, err error) {
	slog.Error("error interno", "method", c.Request.Method, "path", c.Request.URL.Path, "err", err)
	c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "error interno"})
}

// zonaHoraria es la zona de referencia del negocio (Argentina) para decidir a qué
// "día" pertenece una venta. Los query params de fecha (?fecha=, ?mes=) se
// interpretan en esta zona — parsear en UTC (el default de time.Parse) haría que
// una venta de después de las ~21hs cayera en el día siguiente para los filtros
// de reportes, aunque para el negocio siga siendo "hoy".
var zonaHoraria = cargarZonaHoraria()

func cargarZonaHoraria() *time.Location {
	loc, err := time.LoadLocation("America/Argentina/Buenos_Aires")
	if err != nil {
		slog.Error("no se pudo cargar America/Argentina/Buenos_Aires, usando UTC-3 fijo", "err", err)
		return time.FixedZone("ART", -3*60*60)
	}
	return loc
}

// getEmpresaID extrae el empresa_id del contexto Gin (seteado por el middleware JWT).
func getEmpresaID(c *gin.Context) uuid.UUID {
	raw, _ := c.Get("empresa_id")
	str, _ := raw.(string)
	id, _ := uuid.Parse(str)
	return id
}

// loadEmpresa carga la ConfigEmpresa desde la base de datos para el empresa_id dado.
func loadEmpresa(db *gorm.DB, empresaID uuid.UUID) (models.ConfigEmpresa, error) {
	var emp models.ConfigEmpresa
	err := db.First(&emp, "id = ?", empresaID).Error
	return emp, err
}

// rangoDelDia devuelve [inicio, fin) del día calendario de fecha, para filtrar
// por created_at con una comparación que puede usar el índice de la columna
// (a diferencia de envolverla en DATE(...), que fuerza un scan completo).
func rangoDelDia(fecha time.Time) (inicio, fin time.Time) {
	inicio = time.Date(fecha.Year(), fecha.Month(), fecha.Day(), 0, 0, 0, 0, fecha.Location())
	return inicio, inicio.Add(24 * time.Hour)
}

// siguienteNumero genera el próximo número secuencial de forma atómica, por empresa.
func siguienteNumero(tx *gorm.DB, tipo models.TipoComprobante, empresaID uuid.UUID, puntoVenta int) (string, error) {
	contador, err := contadorConLock(tx, tipo, empresaID, puntoVenta)
	if err != nil {
		return "", err
	}
	contador.Ultimo++
	if err := tx.Save(contador).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("%03d-%08d", puntoVenta, contador.Ultimo), nil
}

// contadorConLock trae (bajo SELECT ... FOR UPDATE) el contador de comprobantes para
// (empresa, tipo, punto_venta), creándolo si no existe para esa empresa.
func contadorConLock(tx *gorm.DB, tipo models.TipoComprobante, empresaID uuid.UUID, puntoVenta int) (*models.ComprobanteContador, error) {
	var contador models.ComprobanteContador
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("empresa_id = ? AND tipo = ? AND punto_venta = ?", empresaID, tipo, puntoVenta).
		First(&contador).Error

	if err == nil {
		return &contador, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var existentes int64
	if err := tx.Model(&models.Venta{}).Where("tipo = ? AND empresa_id = ?", tipo, empresaID).Count(&existentes).Error; err != nil {
		return nil, err
	}
	contador = models.ComprobanteContador{EmpresaID: empresaID, Tipo: tipo, PuntoVenta: puntoVenta, Ultimo: existentes}
	if err := tx.Create(&contador).Error; err != nil {
		return nil, err
	}
	return &contador, nil
}

// parseCUIT extrae los dígitos numéricos de un string CUIT (e.g. "20-12345678-9" → 20123456789).
func parseCUIT(cuit string) int64 {
	var result int64
	for _, c := range cuit {
		if c >= '0' && c <= '9' {
			result = result*10 + int64(c-'0')
		}
	}
	return result
}
