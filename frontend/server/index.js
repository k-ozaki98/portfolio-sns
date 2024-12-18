// server/index.js
import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio'; 

const app = express();

// CORSの設定
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// データベース接続設定
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  // password: '1998kouki',
  password: '',
  database: 'portfolio_gallery'
}).promise();

// OGP情報取得関数
async function getOGPData(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    return {
      title: $('meta[property="og:title"]').attr('content'),
      description: $('meta[property="og:description"]').attr('content'),
      image: $('meta[property="og:image"]').attr('content'),
      site_name: $('meta[property="og:site_name"]').attr('content')
    };
  } catch (error) {
    console.error('Error fetching OGP:', error);
    return null;
  }
}

// GET エンドポイント
app.get("/api/portfolios", async (req, res) => {
  try {
    // まずポートフォリオとライク数を取得
    const [portfolios] = await pool.query(`
      SELECT 
        p.*,
        COUNT(l.id) as likes
      FROM portfolios p
      LEFT JOIN likes l ON p.id = l.portfolio_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    // 各ポートフォリオのコメントを取得
    for (let portfolio of portfolios) {
      const [comments] = await pool.query(
        `
        SELECT id, content, created_at
        FROM comments
        WHERE portfolio_id = ?
        ORDER BY created_at DESC
      `,
        [portfolio.id]
      );

      portfolio.comments = comments || [];
    }

    console.log("Processed portfolios:", portfolios);
    res.json({ portfolios });
  } catch (error) {
    console.error("Error fetching portfolios:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// POSTエンドポイント
app.post("/api/portfolios", async (req, res) => {
  const { title, url, industry, experience, color, description } = req.body;

  try {
    const ogpData = await getOGPData(url);

    const [result] = await pool.query(
      "INSERT INTO portfolios (title, url, industry, experience, color, description, ogp_data) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        title,
        url,
        industry,
        experience,
        color,
        description,
        JSON.stringify(ogpData),
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      data: {
        title,
        url,
        industry,
        experience,
        color,
        description,
        ogp_data: ogpData,
      },
    });
  } catch (error) {
    console.error("Error creating portfolio:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// いいねのエンドポイント
app.post("/api/portfolios/:id/like", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      "INSERT INTO likes (portfolio_id) VALUES (?)",
      [id]
    );

    const [likes] = await pool.query(
      "SELECT COUNT(*) as count FROM likes WHERE portfolio_id = ?",
      [id]
    );

    res.json({
      success: true,
      likes: likes[0].count,
    });
  } catch (error) {
    console.error("いいねエラー", error);
    res.status(500).json({ error: "データベースエラー" });
  }
});

// コメントのエンドポイント
app.post("/api/portfolios/:id/comments", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  try {
    const [result] = await pool.query(
      "INSERT INTO comments (portfolio_id, content) VALUES (?, ?, ?)",
      [id, content]
    );

    const [comment] = await pool.query(
      "SELECT id, content, created_at FROM comments WHERE id = ?",
      [result.insertId]
    );

    res.json({
      success: true,
      comment: comment[0],
    });
  } catch (error) {
    console.error("コメントエラー", error);
    res.status(500).json({ error: "データベースエラー" });
  }
});

// const PORT = 8080;
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});