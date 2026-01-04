package migrations

import (
	"encoding/json"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func InitialSchema(app *pocketbase.PocketBase) error {
	log.Println("Running initial schema migration...")

	// Create trades collection
	tradesCollection := core.NewBaseCollection("trades")

	// Set rules to allow public access (for development)
	publicRule := "" // empty rule means public access
	tradesCollection.CreateRule = &publicRule
	tradesCollection.ListRule = &publicRule
	tradesCollection.ViewRule = &publicRule

	// Parse fields for trades
	fieldsJSON := `[
		{"id": "field_market", "name": "market", "type": "text", "required": true, "options": {}},
		{"id": "field_price", "name": "price", "type": "number", "required": true, "options": {}},
		{"id": "field_size", "name": "size", "type": "number", "required": true, "options": {}},
		{"id": "field_timestamp", "name": "timestamp", "type": "date", "required": true, "options": {}}
	]`

	var fields core.FieldsList
	if err := json.Unmarshal([]byte(fieldsJSON), &fields); err != nil {
		log.Printf("Failed to parse fields JSON: %v", err)
		return err
	}
	tradesCollection.Fields = fields

	// Define indexes for trades
	tradesCollection.Indexes = types.JSONArray[string]{
		"CREATE INDEX `idx_market_time` ON `trades` (`market`, `timestamp`)",
	}

	if err := app.Save(tradesCollection); err != nil {
		log.Printf("Failed to create trades collection: %v", err)
		return err
	}
	log.Println("Created trades collection")

	// Create candles_1m collection
	candlesCollection := core.NewBaseCollection("candles_1m")

	// Set rules to allow public access (for development)
	candlesCollection.CreateRule = &publicRule
	candlesCollection.ListRule = &publicRule
	candlesCollection.ViewRule = &publicRule

	// Parse fields for candles
	candlesFieldsJSON := `[
		{"id": "field_market", "name": "market", "type": "text", "required": true, "options": {}},
		{"id": "field_time", "name": "time", "type": "date", "required": true, "options": {}},
		{"id": "field_open", "name": "open", "type": "number", "required": true, "options": {}},
		{"id": "field_high", "name": "high", "type": "number", "required": true, "options": {}},
		{"id": "field_low", "name": "low", "type": "number", "required": true, "options": {}},
		{"id": "field_close", "name": "close", "type": "number", "required": true, "options": {}},
		{"id": "field_volume", "name": "volume", "type": "number", "required": true, "options": {}}
	]`

	var candlesFields core.FieldsList
	if err := json.Unmarshal([]byte(candlesFieldsJSON), &candlesFields); err != nil {
		log.Printf("Failed to parse candles fields JSON: %v", err)
		return err
	}
	candlesCollection.Fields = candlesFields

	// Define indexes for candles (unique on market+time)
	candlesCollection.Indexes = types.JSONArray[string]{
		"CREATE UNIQUE INDEX `idx_market_time_unique` ON `candles_1m` (`market`, `time`)",
	}

	if err := app.Save(candlesCollection); err != nil {
		log.Printf("Failed to create candles_1m collection: %v", err)
		return err
	}
	log.Println("Created candles_1m collection")

	return nil
}
