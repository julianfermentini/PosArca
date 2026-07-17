package api

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/handlers"
	"pos-fiscal/internal/middleware"
)

// SetupRouter arma las rutas. El worker ya encapsula la impresora y el cliente de
// email, así que los handlers solo dependen de él para los efectos secundarios.
func SetupRouter(db *gorm.DB, cfg *config.Config, worker *handlers.Worker) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(corsMiddleware(cfg.CORSOrigins))

	api := r.Group("/api")
	{
		// Rutas públicas
		auth := handlers.NuevoAuthHandler(db, cfg.JWTSecret)
		api.POST("/auth/register", auth.Register)
		api.POST("/auth/login", auth.Login)
		api.GET("/auth/status", auth.HasUsers)

		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})

		// Rutas protegidas
		protected := api.Group("/")
		protected.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			ventas := handlers.NuevoVentasHandler(db, cfg, worker)
			protected.POST("/ventas", ventas.Crear)
			protected.GET("/ventas", ventas.Listar)
			protected.GET("/ventas/dias", ventas.DiasConVentas)

			facturas := handlers.NuevoFacturasHandler(db, cfg, worker)
			protected.POST("/facturas", facturas.Crear)
			protected.GET("/facturas", facturas.Listar)

			reportes := handlers.NuevoReportesHandler(db)
			protected.GET("/reportes/cierre", reportes.CierreCaja)

			syncH := handlers.NuevoSyncHandler(db, cfg, worker)
			protected.POST("/sync/ventas", syncH.SincronizarVentas)

			empresa := handlers.NuevoEmpresaHandler(db, cfg)
			protected.GET("/empresa", empresa.Get)
			protected.PUT("/empresa", empresa.Update)

			productos := handlers.NuevoProductoHandler(db)
			protected.GET("/productos", productos.List)
			protected.POST("/productos", productos.Create)
			protected.PUT("/productos/:id", productos.Update)
			protected.DELETE("/productos/:id", productos.Delete)
		}
	}

	return r
}

// corsMiddleware permite únicamente los orígenes de allowed — nunca "*", porque
// la API acepta el header Authorization y responder con un allow-origin abierto
// habilitaría a cualquier sitio a invocarla desde el navegador de un usuario.
func corsMiddleware(allowed []string) gin.HandlerFunc {
	origins := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		origins[o] = true
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origins[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
