package middleware

import (
	"crypto/subtle"
	"net/http"

	"github.com/gin-gonic/gin"
)

// AdminRequired protege las rutas de administración con el header X-Admin-Secret.
// Es la única fuente de verdad para autorizar el panel de admin: aplicándolo como
// middleware del grupo, ningún handler nuevo puede olvidarse el chequeo.
func AdminRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("X-Admin-Secret")
		// ConstantTimeCompare exige igual longitud; si difieren ya no coincide,
		// pero igual hay que llamarla con algo del mismo tamaño para no filtrar
		// por timing cuánto midió el secreto real.
		match := len(header) == len(secret) && subtle.ConstantTimeCompare([]byte(header), []byte(secret)) == 1
		if secret == "" || !match {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "error": "No autorizado"})
			return
		}
		c.Next()
	}
}
