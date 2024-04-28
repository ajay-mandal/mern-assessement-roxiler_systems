const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const Product = require("./db/schema");

const app = express();
const port = 3001;

// Connect to Database
mongoose.connect(process.env.DB_URL)
  .then(() => {
    console.log("MongoDB connected…")
  })
  .catch(err => console.log(err))

app.get('/initdb', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const data = response.data;

        for (let product of data) {
        const newProduct = new Product({
            id: product.id,
            title: product.title,
            price: product.price,
            description: product.description,
            category: product.category,
            image: product.image,
            sold: product.sold,
            dateOfSale: product.dateOfSale
        });

        await newProduct.save();
        }

        res.json({ message: 'Database initialized with seed data.' });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching data' });
    }
});

// Get all transactions
app.get('/transactions', async (req, res) => {
  const { page = 1, perPage = 10, search = '' } = req.query;

  const searchQuery = {
    $or: [
      { title: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') },
      { price: isNaN(search) ? 0 : Number(search) },
    ],
  };

  try {
    const transactions = await Product.find(searchQuery)
      .skip((page - 1) * perPage)
      .limit(perPage);

    res.json(transactions);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API for statistics
app.get('/statistics', async (req, res) => {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({ error: 'Month is required to enter' });
    }

    const startDate = new Date(2021, month - 1, 1);
    const endDate = new Date(2022, month, 1);

    try {
      const totalSaleAmount = await Product.aggregate([
        {
          $match: {
            dateOfSale: { $gte: startDate, $lt: endDate },
            sold: true
          }
        },
        {
          $group: {
            _id: null,
            totalSaleAmount: { $sum: "$price" }
          }
        }
      ]);

      const totalSoldItems = await Product.countDocuments({
        dateOfSale: { $gte: startDate, $lt: endDate },
        sold: true
      });

      const totalNotSoldItems = await Product.countDocuments({
        dateOfSale: { $gte: startDate, $lt: endDate },
        sold: false
      });

      res.json({
        totalSaleAmount: totalSaleAmount.length > 0 ? totalSaleAmount[0].totalSaleAmount : 0,
        totalSoldItems,
        totalNotSoldItems
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
});

app.get('/barchart', async (req, res) => {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({ error: 'Month is required' });
    }

    const startDate = new Date(2021, month - 1, 1);
    const endDate = new Date(2022, month, 1);

    try {
      const priceRanges = [
        { $gte: 0, $lt: 101 },
        { $gte: 101, $lt: 201 },
        { $gte: 201, $lt: 301 },
        { $gte: 301, $lt: 401 },
        { $gte: 401, $lt: 501 },
        { $gte: 501, $lt: 601 },
        { $gte: 601, $lt: 701 },
        { $gte: 701, $lt: 801 },
        { $gte: 801, $lt: 901 },
        { $gte: 901 }
      ];

      const barChartData = await Promise.all(priceRanges.map(async (range) => {
        const count = await Product.countDocuments({
          dateOfSale: { $gte: startDate, $lt: endDate },
          price: range
        });

        return {
          range: `${range.$gte}-${range.$lt || 'above'}`,
          count
        };
      }));

      res.json(barChartData);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
});

app.get('/piechart', async (req, res) => {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({ error: 'Month is required' });
    }

    const startDate = new Date(2021, month - 1, 1);
    const endDate = new Date(2022, month, 1);

    try {
      const categories = await Product.aggregate([
        {
          $match: {
            dateOfSale: { $gte: startDate, $lt: endDate }
          }
        },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 }
          }
        }
      ]);

      const pieChartData = categories.map(category => ({
        category: category._id,
        count: category.count
      }));

      res.json(pieChartData);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
});

app.get('/combined', async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res.status(400).json({ error: 'Month is required' });
  }

  try {
    const [statisticsResponse, barchartResponse, piechartResponse] = await Promise.all([
      axios.get(`http://localhost:${port}/statistics?month=${month}`),
      axios.get(`http://localhost:${port}/barchart?month=${month}`),
      axios.get(`http://localhost:${port}/piechart?month=${month}`)
    ]);

    const combinedResponse = {
      statistics: statisticsResponse.data,
      barchart: barchartResponse.data,
      piechart: piechartResponse.data
    };

    res.json(combinedResponse);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
