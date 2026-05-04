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
	// Si ventas tiene la columna 'items' es el schema viejo (JSONB) — lo descartamos.
	var itemsCol int64
	db.Raw(`SELECT COUNT(*) FROM information_schema.columns
		WHERE table_name = 'ventas' AND column_name = 'items'`).Scan(&itemsCol)

	if itemsCol > 0 {
		slog.Info("schema anterior detectado (items JSONB), recreando tablas normalizadas...")
		db.Exec(`DROP TABLE IF EXISTS facturas CASCADE`)
		db.Exec(`DROP TABLE IF EXISTS ventas CASCADE`)
		db.Exec(`DROP TABLE IF EXISTS config_empresa CASCADE`)
	}

	return db.AutoMigrate(
		&models.Venta{},
		&models.VentaItem{},
		&models.Factura{},
		&models.ConfigEmpresa{},
	)
}
