package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pos-fiscal/config"
	"pos-fiscal/internal/api"
	"pos-fiscal/internal/db"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/handlers"
)

func main() {
	cfg := config.Load()

	database, err := db.Connect(cfg)
	if err != nil {
		slog.Error("no se pudo conectar a la base de datos", "err", err)
		os.Exit(1)
	}

	emailCli := email.NuevoCliente(email.Config{
		ResendAPIKey: cfg.ResendAPIKey,
		FromEmail:    cfg.ResendFromEmail,
		FromName:     cfg.SMTPFromName,
	})

	workerCtx, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	worker := handlers.NuevoWorker(database, emailCli, cfg.AlertEmail)
	go worker.Iniciar(workerCtx, 5*time.Second)

	router := api.SetupRouter(database, cfg, worker)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		slog.Info("servidor POS iniciado", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("error servidor", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("apagando servidor...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
