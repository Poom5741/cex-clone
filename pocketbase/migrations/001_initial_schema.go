package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
)

func InitialSchema(app *pocketbase.PocketBase) error {
	log.Println("Running initial schema migration...")
	log.Println("Note: Please create 'trades' and 'candles_1m' collections via the PocketBase admin UI")
	log.Println("Or import them from the pocketbase/collections.json file")
	return nil
}
