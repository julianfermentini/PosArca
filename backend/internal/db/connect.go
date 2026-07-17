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
	); err != nil {
		return err
	}

	// Eliminar restricción NOT NULL de cuit si existe (puede fallar silenciosamente)
	db.Exec(`ALTER TABLE config_empresa ALTER COLUMN cuit DROP NOT NULL`)

	return nil
}
