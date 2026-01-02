package hooks

import (
	"log"
	"math"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// FloorToMinute floors a timestamp to the nearest minute
func FloorToMinute(t time.Time) time.Time {
	return t.Truncate(time.Minute)
}

// RegisterCandleAggregationHook registers the hook that aggregates candles from trades
func RegisterCandleAggregationHook(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateSuccess("trades").BindFunc(func(e *core.RecordEvent) error {
		trade := e.Record

		// Get market and timestamp
		market := trade.GetString("market")
		timestamp := trade.GetDateTime("timestamp")
		if timestamp.IsZero() {
			timestamp = types.NowDateTime()
		}

		// Floor to minute
		minuteBucket := FloorToMinute(timestamp.Time())

		// Find existing candle or create new one
		candle, err := app.FindFirstRecordByFilter(
			"candles_1m",
			"market = {:market} && time = {:time}",
			dbx.Params{"market": market, "time": minuteBucket},
		)

		price := trade.GetFloat("price")
		size := trade.GetFloat("size")

		if err != nil {
			// Create new candle
			collection, err := app.FindCollectionByNameOrId("candles_1m")
			if err != nil {
				log.Printf("Error finding candles_1m collection: %v", err)
				return err
			}
			candle = core.NewRecord(collection)
			candle.Set("market", market)
			candle.Set("time", minuteBucket)
			candle.Set("open", price)
			candle.Set("high", price)
			candle.Set("low", price)
			candle.Set("close", price)
			candle.Set("volume", size)
		} else {
			// Update existing candle
			existingHigh := candle.GetFloat("high")
			existingLow := candle.GetFloat("low")
			existingVolume := candle.GetFloat("volume")

			candle.Set("high", math.Max(existingHigh, price))
			candle.Set("low", math.Min(existingLow, price))
			candle.Set("close", price)
			candle.Set("volume", existingVolume+size)
		}

		if err := app.Save(candle); err != nil {
			log.Printf("Error saving candle: %v", err)
			return err
		}

		return nil
	})
}
