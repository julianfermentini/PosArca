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
	dsn := cfg.DatabaseURL

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(
		&models.Venta{},
		&models.Factura{},
		&models.ConfigEmpresa{},
	); err != nil {
		return nil, err
	}

	slog.Info("base de datos conectada y migrada")
	DB = db
	return db, nil
}
