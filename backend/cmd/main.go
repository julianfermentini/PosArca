package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"pos-fiscal/config"
	"pos-fiscal/internal/api"
	"pos-fiscal/internal/db"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/handlers"
	"pos-fiscal/internal/impresora"
)

func main() {
	cfg := config.Load()

	// Si los certs vienen como variables de entorno (Railway), escribirlos a disco
	if content := os.Getenv("ARCA_CERT_CONTENT"); content != "" {
		_ = os.MkdirAll(filepath.Dir(cfg.ArcaCertPath), 0700)
		if err := os.WriteFile(cfg.ArcaCertPath, []byte(content), 0600); err == nil {
			slog.Info("certificado ARCA escrito desde variable de entorno")
		}
	}
	if content := os.Getenv("ARCA_KEY_CONTENT"); content != "" {
		_ = os.MkdirAll(filepath.Dir(cfg.ArcaKeyPath), 0700)
		if err := os.WriteFile(cfg.ArcaKeyPath, []byte(content), 0600); err == nil {
			slog.Info("clave privada ARCA escrita desde variable de entorno")
		}
	}

	database, err := db.Connect(cfg)
	if err != nil {
		slog.Error("no se pudo conectar a la base de datos", "err", err)
		os.Exit(1)
	}

	imp := impresora.Nueva(cfg.PrinterPort, cfg.PrinterBaud)
	defer imp.Cerrar()

	emailCli := email.NuevoCliente(email.Config{
		ResendAPIKey: cfg.ResendAPIKey,
		FromEmail:    cfg.ResendFromEmail,
		FromName:     cfg.SMTPFromName,
	})

	workerCtx, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	worker := handlers.NuevoWorker(database, cfg, imp, emailCli)
	go worker.Iniciar(workerCtx, 5*time.Second)

	router := api.SetupRouter(database, cfg, imp, emailCli, worker)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		slog.Info("servidor POS iniciado", "port", cfg.Port, "arca_env", cfg.ArcaEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("error servidor", "err", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("apagando servidor...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
