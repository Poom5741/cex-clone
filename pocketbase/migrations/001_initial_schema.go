package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

func InitialSchema(dao *daos.Dao) error {
	// Create trades collection
	tradesCollection := &models.Collection{
		Name: "trades",
		Type: models.CollectionTypeBase,
		Schema: models.Schema{
			{
				Name:     "market",
				Type:     models.FieldTypeText,
				Required: true,
				Options: &models.TextOptions{
					Min: 1,
				},
			},
			{
				Name:     "price",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "size",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "side",
				Type:     models.FieldTypeSelect,
				Required: true,
				Options: &models.SelectOptions{
					Values: []string{"buy", "sell"},
				},
			},
			{
				Name:     "timestamp",
				Type:     models.FieldTypeDate,
				Required: true,
			},
			{
				Name: "tx_hash",
				Type: models.FieldTypeText,
			},
			{
				Name: "log_index",
				Type: models.FieldTypeNumber,
			},
		},
		Indexes: models.Indexes{
			"idx_market":     `CREATE INDEX idx_market ON trades (market)`,
			"idx_timestamp": `CREATE INDEX idx_timestamp ON trades (timestamp)`,
		},
	}

	if err := dao.SaveCollection(tradesCollection); err != nil {
		return err
	}

	// Create candles_1m collection
	candlesCollection := &models.Collection{
		Name: "candles_1m",
		Type: models.CollectionTypeBase,
		Schema: models.Schema{
			{
				Name:     "time",
				Type:     models.FieldTypeDate,
				Required: true,
			},
			{
				Name:     "market",
				Type:     models.FieldTypeText,
				Required: true,
			},
			{
				Name:     "open",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "high",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "low",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "close",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "volume",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
		},
		Indexes: models.Indexes{
			"idx_market_time": `CREATE UNIQUE INDEX idx_market_time ON candles_1m (market, time)`,
		},
	}

	if err := dao.SaveCollection(candlesCollection); err != nil {
		return err
	}

	return nil
}
