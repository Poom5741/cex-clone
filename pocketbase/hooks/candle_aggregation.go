package hooks

import (
	"log"
	"math"
	"strings"
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
	// Cache the collection reference at hook registration time (P1 optimization)
	candlesCollection, err := app.FindCollectionByNameOrId("candles_1m")
	if err != nil {
		log.Printf("CRITICAL: Failed to find candles_1m collection during hook registration: %v", err)
		return
	}

	app.OnRecordAfterCreateSuccess("trades").BindFunc(func(e *core.RecordEvent) error {
		trade := e.Record
		tradeID := trade.Id

		// P1: Input validation - validate before processing
		market := trade.GetString("market")
		if market == "" {
			log.Printf("Trade %s: validation failed - empty market", tradeID)
			return nil // Skip invalid trades silently
		}

		price := trade.GetFloat("price")
		if price <= 0 {
			log.Printf("Trade %s: validation failed - invalid price %.2f for market %s", tradeID, price, market)
			return nil
		}

		size := trade.GetFloat("size")
		if size <= 0 {
			log.Printf("Trade %s: validation failed - invalid size %.2f for market %s", tradeID, size, market)
			return nil
		}

		timestamp := trade.GetDateTime("timestamp")
		if timestamp.IsZero() {
			timestamp = types.NowDateTime()
		}

		// Floor to minute
		minuteBucket := FloorToMinute(timestamp.Time())

		// P0: Race condition fix - use upsert pattern with retry logic
		// Try to find existing candle first
		candle, err := app.FindFirstRecordByFilter(
			"candles_1m",
			"market = {:market} && time = {:time}",
			dbx.Params{"market": market, "time": minuteBucket},
		)

		if err != nil {
			// Candle doesn't exist, create new one
			candle = core.NewRecord(candlesCollection)
			candle.Set("market", market)
			candle.Set("time", minuteBucket)
			candle.Set("open", price)
			candle.Set("high", price)
			candle.Set("low", price)
			candle.Set("close", price)
			candle.Set("volume", size)

			// Attempt to save the new candle
			if err := app.Save(candle); err != nil {
				// Check if this is a unique constraint violation (race condition)
				// If another process created the candle concurrently, retry by finding and updating
				if isDuplicateKeyError(err) {
					log.Printf("Trade %s: race condition detected for market %s at %v, retrying...", tradeID, market, minuteBucket)

					// Retry: find the candle created by the concurrent process
					retryCandle, retryErr := app.FindFirstRecordByFilter(
						"candles_1m",
						"market = {:market} && time = {:time}",
						dbx.Params{"market": market, "time": minuteBucket},
					)
					if retryErr != nil {
						log.Printf("Trade %s: failed to find candle after race condition retry for market %s at %v: %v", tradeID, market, minuteBucket, retryErr)
						return retryErr
					}

					// Update the existing candle
					existingHigh := retryCandle.GetFloat("high")
					existingLow := retryCandle.GetFloat("low")
					existingVolume := retryCandle.GetFloat("volume")

					retryCandle.Set("high", math.Max(existingHigh, price))
					retryCandle.Set("low", math.Min(existingLow, price))
					retryCandle.Set("close", price)
					retryCandle.Set("volume", existingVolume+size)

					if saveErr := app.Save(retryCandle); saveErr != nil {
						log.Printf("Trade %s: failed to save candle after race condition retry for market %s price %.2f: %v", tradeID, market, price, saveErr)
						return saveErr
					}

					log.Printf("Trade %s: successfully updated candle after race condition for market %s", tradeID, market)
					return nil
				}

				log.Printf("Trade %s: failed to save new candle for market %s price %.2f: %v", tradeID, market, price, err)
				return err
			}

			log.Printf("Trade %s: created new candle for market %s at %v", tradeID, market, minuteBucket)
		} else {
			// Candle exists, update it
			existingHigh := candle.GetFloat("high")
			existingLow := candle.GetFloat("low")
			existingVolume := candle.GetFloat("volume")

			candle.Set("high", math.Max(existingHigh, price))
			candle.Set("low", math.Min(existingLow, price))
			candle.Set("close", price)
			candle.Set("volume", existingVolume+size)

			if err := app.Save(candle); err != nil {
				log.Printf("Trade %s: failed to update candle for market %s price %.2f: %v", tradeID, market, price, err)
				return err
			}

			log.Printf("Trade %s: updated candle for market %s at %v", tradeID, market, minuteBucket)
		}

		return nil
	})
}

// isDuplicateKeyError checks if the error is a duplicate key constraint violation
// This indicates a race condition where another process inserted the same record
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}

	// SQLite specific: UNIQUE constraint failed
	// PocketBase uses SQLite under the hood
	errStr := err.Error()
	return strings.Contains(strings.ToLower(errStr), "unique constraint failed") ||
		strings.Contains(strings.ToLower(errStr), "duplicate key") ||
		strings.Contains(strings.ToLower(errStr), "duplicate entry")
}
