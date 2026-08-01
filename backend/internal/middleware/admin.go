package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AdminRequired protege las rutas de administración con el header X-Admin-Secret.
// Es la única fuente de verdad para autorizar el panel de admin: aplicándolo como
// middleware del grupo, ningún handler nuevo puede olvidarse el chequeo.
func AdminRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if secret == "" || c.GetHeader("X-Admin-Secret") != secret {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "error": "No autorizado"})
			return
		}
		c.Next()
	}
}
