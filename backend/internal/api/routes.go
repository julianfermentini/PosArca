package api

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"pos-fiscal/config"
	"pos-fiscal/internal/handlers"
	"pos-fiscal/internal/middleware"
)

func SetupRouter(db *gorm.DB, cfg *config.Config, worker *handlers.Worker) *gin.Engine {
	r := gin.New()
	// La IP del cliente la resolvemos nosotros desde X-Forwarded-For (ver
	// middleware.RateLimit). Le decimos a Gin que no confíe en ningún proxy para
	// que su propio ClientIP no lea un XFF spoofeable, y de paso se silencia el
	// warning de arranque "You trusted all proxies, this is NOT safe".
	_ = r.SetTrustedProxies(nil)
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(corsMiddleware(cfg.CORSOrigins))

	api := r.Group("/api")
	{
		// Rutas públicas
		auth := handlers.NuevoAuthHandler(db, cfg.JWTSecret, cfg.InviteCode)
		authLimiter := middleware.RateLimit(5.0/60.0, 5) // 5 intentos/min, ráfaga de 5
		api.POST("/auth/register", authLimiter, auth.Register)
		api.POST("/auth/login", authLimiter, auth.Login)
		api.GET("/auth/status", auth.HasUsers)

		// Rutas de administración (protegidas por X-Admin-Secret, no por JWT)
		admin := handlers.NuevoAdminHandler(db)
		adminGrp := api.Group("/admin")
		adminGrp.Use(middleware.RateLimit(10.0/60.0, 10), middleware.AdminRequired(cfg.AdminSecret))
		{
			adminGrp.POST("/crear-cuenta", admin.CrearCuenta)
			adminGrp.GET("/cuentas", admin.ListarCuentas)
			adminGrp.POST("/reset-password", admin.ResetPassword)
			adminGrp.PUT("/cuentas/:id", admin.ActualizarCuenta)
			adminGrp.PATCH("/cuentas/:id/estado", admin.CambiarEstado)
			adminGrp.DELETE("/cuentas/:id", admin.EliminarCuenta)
		}

		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})

		// Rutas protegidas
		protected := api.Group("/")
		protected.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			ventas := handlers.NuevoVentasHandler(db, worker)
			protected.POST("/ventas", ventas.Crear)
			protected.GET("/ventas", ventas.Listar)
			protected.GET("/ventas/dias", ventas.DiasConVentas)

			facturas := handlers.NuevoFacturasHandler(db, worker)
			protected.POST("/facturas", facturas.Crear)
			protected.GET("/facturas", facturas.Listar)

			reportes := handlers.NuevoReportesHandler(db)
			protected.GET("/reportes/cierre", reportes.CierreCaja)

			syncH := handlers.NuevoSyncHandler(db, worker)
			protected.POST("/sync/ventas", syncH.SincronizarVentas)

			pendientes := handlers.NuevoPendientesHandler(db, worker)
			protected.GET("/pendientes-cae", pendientes.Listar)
			protected.POST("/pendientes-cae/:id/anular", pendientes.Anular)
			protected.PUT("/pendientes-cae/:id/corregir", pendientes.Corregir)

			empresa := handlers.NuevoEmpresaHandler(db)
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
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Secret")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
