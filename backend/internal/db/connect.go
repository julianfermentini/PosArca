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
		&models.ConfigEmpresa{},
		&models.Venta{},
		&models.VentaItem{},
		&models.Factura{},
		&models.Producto{},
		&models.ComprobanteContador{},
		&models.ArcaTokenCache{},
		&models.TareaPendiente{},
	); err != nil {
		return err
	}

	// Limpiezas de nullable legacy
	db.Exec(`ALTER TABLE config_empresa ALTER COLUMN cuit DROP NOT NULL`)
	db.Exec(`ALTER TABLE ventas ALTER COLUMN metodo_pago DROP NOT NULL`)

	// Backfill split-payment (ventas con metodo_pago único pre-multimonto)
	db.Exec(`UPDATE ventas SET monto_efectivo  = (SELECT COALESCE(SUM(vi.total),0) FROM venta_items vi WHERE vi.venta_id = ventas.id) WHERE metodo_pago = 'EFECTIVO'  AND monto_efectivo  = 0`)
	db.Exec(`UPDATE ventas SET monto_tarjeta   = (SELECT COALESCE(SUM(vi.total),0) FROM venta_items vi WHERE vi.venta_id = ventas.id) WHERE metodo_pago = 'TARJETA'   AND monto_tarjeta   = 0`)
	db.Exec(`UPDATE ventas SET monto_billetera = (SELECT COALESCE(SUM(vi.total),0) FROM venta_items vi WHERE vi.venta_id = ventas.id) WHERE metodo_pago = 'BILLETERA' AND monto_billetera = 0`)

	// ── Migración multi-tenant ──────────────────────────────────────────────
	// Agrega empresa_id a las tablas que no lo tienen, backfill desde la única
	// empresa existente (si hay), y adapta la PK de comprobante_contadores.
	// Todo es idempotente: usa DO $$ con chequeos de columna/constraint previos.

	if err := db.Exec(`DO $$
DECLARE eid uuid;
BEGIN
  SELECT id INTO eid FROM config_empresa LIMIT 1;

  -- users
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='empresa_id') THEN
    ALTER TABLE users ADD COLUMN empresa_id uuid;
  END IF;
  IF eid IS NOT NULL THEN
    UPDATE users SET empresa_id = eid WHERE empresa_id IS NULL;
  END IF;

  -- ventas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ventas' AND column_name='empresa_id') THEN
    ALTER TABLE ventas ADD COLUMN empresa_id uuid;
  END IF;
  IF eid IS NOT NULL THEN
    UPDATE ventas SET empresa_id = eid WHERE empresa_id IS NULL;
  END IF;

  -- facturas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturas' AND column_name='empresa_id') THEN
    ALTER TABLE facturas ADD COLUMN empresa_id uuid;
  END IF;
  IF eid IS NOT NULL THEN
    UPDATE facturas SET empresa_id = eid WHERE empresa_id IS NULL;
  END IF;

  -- productos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='productos' AND column_name='empresa_id') THEN
    ALTER TABLE productos ADD COLUMN empresa_id uuid;
  END IF;
  IF eid IS NOT NULL THEN
    UPDATE productos SET empresa_id = eid WHERE empresa_id IS NULL;
  END IF;

  -- tareas_pendientes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas_pendientes' AND column_name='empresa_id') THEN
    ALTER TABLE tareas_pendientes ADD COLUMN empresa_id uuid;
  END IF;
  IF eid IS NOT NULL THEN
    UPDATE tareas_pendientes SET empresa_id = eid WHERE empresa_id IS NULL;
  END IF;

  -- comprobante_contadores: migrar PK de (tipo, punto_venta) → (empresa_id, tipo, punto_venta)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comprobante_contadores' AND column_name='empresa_id') THEN
    ALTER TABLE comprobante_contadores ADD COLUMN empresa_id uuid;
    IF eid IS NOT NULL THEN
      UPDATE comprobante_contadores SET empresa_id = eid;
      -- Reemplazar la PK vieja por la nueva de 3 columnas
      ALTER TABLE comprobante_contadores DROP CONSTRAINT IF EXISTS comprobante_contadores_pkey;
      ALTER TABLE comprobante_contadores ADD PRIMARY KEY (empresa_id, tipo, punto_venta);
    END IF;
  END IF;

END $$`).Error; err != nil {
		return err
	}

	// FIX aislamiento multi-tenant: el índice único de ventas era global
	// (tipo, numero), sin empresa_id — dos empresas distintas colisionaban al
	// llegar ambas al mismo correlativo local (ej. la primera "001-00000001"
	// de su historia). AutoMigrate ya creó el índice nuevo de 3 columnas
	// (uniqueIndex del modelo Venta); acá sacamos el viejo, que quedó huérfano
	// y seguiría bloqueando inserts si no se borra explícitamente.
	if err := db.Exec(`DROP INDEX IF EXISTS idx_ventas_tipo_numero`).Error; err != nil {
		slog.Error("no se pudo borrar el índice único global viejo de ventas", "err", err)
	}

	// Índices únicos necesarios para el funcionamiento correcto
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_arca_token_cache_cuit ON arca_token_cache (cuit)`).Error; err != nil {
		slog.Error("no se pudo crear índice único de arca_token_cache", "err", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_venta_id ON facturas (venta_id)`).Error; err != nil {
		slog.Error("no se pudo crear índice único de facturas.venta_id", "err", err)
	}

	// FK de tareas_pendientes → ventas (CASCADE para que borrar una venta limpie sus tareas)
	if err := db.Exec(`DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tareas_pendientes_venta') THEN
			ALTER TABLE tareas_pendientes
				ADD CONSTRAINT fk_tareas_pendientes_venta
				FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
		END IF;
	END $$`).Error; err != nil {
		slog.Error("no se pudo crear FK de tareas_pendientes.venta_id", "err", err)
	}

	return nil
}
