package api

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/handlers"
	"pos-fiscal/internal/impresora"
)

func SetupRouter(db *gorm.DB, cfg *config.Config, imp *impresora.Impresora, emailCli *email.Cliente) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(corsMiddleware())

	api := r.Group("/api")
	{
		ventas := handlers.NuevoVentasHandler(db, cfg, imp)
		api.POST("/ventas", ventas.Crear)
		api.GET("/ventas", ventas.Listar)

		facturas := handlers.NuevoFacturasHandler(db, cfg, imp, emailCli)
		api.POST("/facturas", facturas.Crear)
		api.GET("/facturas", facturas.Listar)

		reportes := handlers.NuevoReportesHandler(db)
		api.GET("/reportes/cierre", reportes.CierreCaja)

		syncH := handlers.NuevoSyncHandler(db, cfg)
		api.POST("/sync/ventas", syncH.SincronizarVentas)

		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})
	}

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
