package handlers

import (
	"log/slog"
	"time"

	"gorm.io/gorm"

	// tzdata embebe la base IANA en el binario — sin esto, time.LoadLocation
	// puede fallar si el contenedor no trae el paquete de sistema tzdata.
	_ "time/tzdata"

	"pos-fiscal/config"
	"pos-fiscal/internal/models"
)

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

// getEmpresaConf obtiene la configuración del negocio desde la BD.
// Si la BD no tiene datos todavía, usa los valores del .env como fallback.
func getEmpresaConf(db *gorm.DB, cfg *config.Config) models.ConfigEmpresa {
	var emp models.ConfigEmpresa
	db.First(&emp)
	if emp.RazonSocial == "" {
		emp.RazonSocial = cfg.NegocioNombre
		emp.Direccion = cfg.NegocioDirec
		emp.Telefono = cfg.NegocioTel
		emp.CondicionIVA = cfg.NegocioIVACond
		emp.PuntoVenta = cfg.ArcaPuntoVenta
		emp.ArcaEnv = cfg.ArcaEnv
	}
	// CUIT siempre desde env var — es un dato fiscal que debe coincidir con el certificado ARCA
	if cfg.ArcaCUIT != "" {
		emp.CUIT = cfg.ArcaCUIT
	}
	return emp
}

// rangoDelDia devuelve [inicio, fin) del día calendario de fecha, para filtrar
// por created_at con una comparación que puede usar el índice de la columna
// (a diferencia de envolverla en DATE(...), que fuerza un scan completo).
func rangoDelDia(fecha time.Time) (inicio, fin time.Time) {
	inicio = time.Date(fecha.Year(), fecha.Month(), fecha.Day(), 0, 0, 0, 0, fecha.Location())
	return inicio, inicio.Add(24 * time.Hour)
}
