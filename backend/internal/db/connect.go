package db

import (
	"log/slog"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"pos-fiscal/config"
	"pos-fiscal/internal/models"
)

var DB *gorm.DB

func Connect(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	if err := migrar(db); err != nil {
		return nil, err
	}

	slog.Info("base de datos conectada y migrada")
	DB = db
	return db, nil
}

func migrar(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.Venta{},
		&models.VentaItem{},
		&models.Factura{},
		&models.ConfigEmpresa{},
		&models.Producto{},
		&models.ComprobanteContador{},
		&models.ArcaTokenCache{},
		&models.TareaPendiente{},
	); err != nil {
		return err
	}

	// Eliminar restricción NOT NULL de cuit si existe (puede fallar silenciosamente)
	db.Exec(`ALTER TABLE config_empresa ALTER COLUMN cuit DROP NOT NULL`)

	// AutoMigrate no siempre agrega constraints nuevos a una tabla que ya existe.
	// Estos dos índices son imprescindibles: el primero para el ON CONFLICT del
	// caché de token ARCA, el segundo para que el contador de numeración de
	// comprobantes sea realmente único por (tipo, punto_venta) y no puedan crearse
	// dos filas para la misma clave bajo concurrencia. Si fallan (ej. ya hay filas
	// duplicadas) no aborta el arranque, pero queda logueado en vez de en silencio.
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_arca_token_cache_cuit ON arca_token_cache (cuit)`).Error; err != nil {
		slog.Error("no se pudo crear índice único de arca_token_cache", "err", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_comprobante_contadores_tipo_pv ON comprobante_contadores (tipo, punto_venta)`).Error; err != nil {
		slog.Error("no se pudo crear índice único de comprobante_contadores", "err", err)
	}

	return nil
}
