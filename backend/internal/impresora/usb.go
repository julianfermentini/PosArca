package impresora

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/tarm/serial"
)

// Impresora mantiene la conexión serial con la Gadnic térmica.
type Impresora struct {
	mu   sync.Mutex
	port *serial.Port
	cfg  *serial.Config
}

// Nueva crea la instancia de la impresora pero no abre el puerto todavía.
func Nueva(portName string, baud int) *Impresora {
	return &Impresora{
		cfg: &serial.Config{
			Name:        portName,
			Baud:        baud,
			ReadTimeout: 2 * time.Second,
		},
	}
}

// Imprimir envía los bytes ESC/POS a la impresora. Thread-safe.
func (imp *Impresora) Imprimir(ctx context.Context, datos []byte) error {
	imp.mu.Lock()
	defer imp.mu.Unlock()

	if err := imp.conectar(); err != nil {
		return fmt.Errorf("conectar impresora: %w", err)
	}

	total := 0
	for total < len(datos) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		n, err := imp.port.Write(datos[total:])
		if err != nil {
			imp.cerrar()
			return fmt.Errorf("escribir puerto serial: %w", err)
		}
		total += n
	}

	slog.Info("ticket impreso", "bytes", total)
	return nil
}

func (imp *Impresora) conectar() error {
	if imp.port != nil {
		return nil
	}
	port, err := serial.OpenPort(imp.cfg)
	if err != nil {
		return err
	}
	imp.port = port
	return nil
}

func (imp *Impresora) cerrar() {
	if imp.port != nil {
		imp.port.Close()
		imp.port = nil
	}
}

// Cerrar cierra el puerto serial. Llamar al apagar el servidor.
func (imp *Impresora) Cerrar() {
	imp.mu.Lock()
	defer imp.mu.Unlock()
	imp.cerrar()
}
