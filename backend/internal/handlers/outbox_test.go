package handlers

import (
	"strings"
	"testing"

	"pos-fiscal/internal/models"
)

func TestMensajeAlertaCAE_IncluyeDetalle(t *testing.T) {
	venta := models.Venta{Numero: "0001-00000042"}
	tarea := models.TareaPendiente{Intentos: 7, UltimoError: "SOAP Fault WSAA: cert vencido"}

	asunto, cuerpo := mensajeAlertaCAE(3, venta, "Bar El Rincón", tarea)

	if !strings.Contains(asunto, "3") {
		t.Errorf("el asunto debería incluir la cantidad, dio: %q", asunto)
	}
	for _, esperado := range []string{"Bar El Rincón", "0001-00000042", "7", "cert vencido"} {
		if !strings.Contains(cuerpo, esperado) {
			t.Errorf("el cuerpo debería incluir %q, dio:\n%s", esperado, cuerpo)
		}
	}
}

func TestMensajeAlertaCAE_OmiteCamposVacios(t *testing.T) {
	// Sin razón social ni último error, el mensaje no debe dejar líneas colgadas.
	_, cuerpo := mensajeAlertaCAE(1, models.Venta{Numero: "0001-00000001"}, "", models.TareaPendiente{Intentos: 5})

	if strings.Contains(cuerpo, "Empresa:") {
		t.Errorf("sin razón social no debería aparecer la línea Empresa:\n%s", cuerpo)
	}
	if strings.Contains(cuerpo, "Último error:") {
		t.Errorf("sin último error no debería aparecer la línea Último error:\n%s", cuerpo)
	}
}
