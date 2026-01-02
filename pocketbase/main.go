package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/poom-work/tokenine/pocketbase/hooks"
	"github.com/poom-work/tokenine/pocketbase/migrations"
)

func main() {
	app := pocketbase.New()

	// Run migrations on bootstrap
	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		// Run migrations
		if err := migrations.InitialSchema(app); err != nil {
			log.Printf("Migration error: %v", err)
		}

		return nil
	})

	// Register hooks
	hooks.RegisterCandleAggregationHook(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
