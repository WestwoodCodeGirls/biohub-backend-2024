const express = require('express')
const app = express();
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/problems', async (req, res) => {
  try {
    let { page=1, limit=50, tags, competitions, shuffled=false, shuffleIndices } = req.query;
    let yearStart = req.query.yearStart == 'undefined' ? 1000 : req.query.yearStart;
    let yearEnd = req.query.yearEnd == 'undefined' ? 3000 : req.query.yearEnd;
    let offset = req.query.offset ? req.query.offset : 0;
    let query = '';
    const values = [];

    // filter by year range
    query += ` WHERE year BETWEEN $${values.length + 1} AND $${values.length + 2}`;
    values.push(yearStart, yearEnd);

    // filter by tags
    if (tags && tags != 'undefined') {
      tags = JSON.parse(decodeURIComponent(tags));
      if (Object.keys(tags).length != 0) {
        let tagsQuery = '';
        for (let category of Object.keys(tags)) {
          for (let subcategory of tags[category]) {
            tagsQuery += ` OR (problem_json -> 'tags' ? $${values.length + 1}`
              values.push(category);
              tagsQuery += ` AND problem_json -> 'tags' -> $${values.length} @> $${values.length + 1}::jsonb)`;
            values.push(JSON.stringify(subcategory));
          }
        }
        query += ' AND (' + tagsQuery.substring(4) + ')';
      }
    }

    // filter by competitions
    if (competitions && competitions != 'undefined') {
      competitions = JSON.parse(decodeURIComponent(competitions));
      if (Object.keys(competitions).length != 0) {
        let competitionQuery = '';
        for (let comp of Object.keys(competitions)) {
          for (let round of competitions[comp]) {
            competitionQuery += ` OR (competition = $${values.length + 1} AND (round = $${values.length + 2} OR round = ''))`;
            values.push(comp);
            values.push(round);
          }
        }
        query += ' AND (' + competitionQuery.substring(4) + ')';
      }
    }

    let problems = [];
    if (!shuffled) {
      // offset using page number
      const actualOffset = Math.max((Number(page) - 1) * Number(limit) + Number(offset), 0);
      let limitQuery = ` OFFSET $${values.length + 1}`;
      let limitValues = [];
      limitValues.push(actualOffset);

      // limit number of results
      if ((Number(page) - 1) * Number(limit) + Number(offset) < 0) {
        limit = Number(limit) + (Number(page) - 1) * Number(limit) + Number(offset)
      }
      limitQuery += ` LIMIT $${values.length + 2}`;
      limitValues.push(limit);

      const problemsQuery = `SELECT * FROM problems.problems` + query + limitQuery;
      problems = await pool.query(problemsQuery, [...values, ...limitValues]);
      for (let i = 0; i < problems.rows.length; i++) {
        problems.rows[i].index = i + Number(actualOffset);
      }
      problems = problems.rows;
    } else { // shuffling algorithm
      shuffleIndices = JSON.parse(decodeURIComponent(shuffleIndices));
      for (let i = 0; i < shuffleIndices.length; i++)  {
        const index = shuffleIndices[i];

        let limitQuery = ` OFFSET $${values.length + 1}`;
        let limitValues = [];
        limitValues.push(index);
        limitQuery += ` LIMIT 1`;
        const problemsQuery = `SELECT * FROM problems.problems` + query + limitQuery;
        const problem = await pool.query(problemsQuery, [...values, ...limitValues]);
        problems.push({...problem.rows[0], index: i + Number(offset)});
      }
    }
    const countQuery = `SELECT COUNT(*) FROM problems.problems` + query;
    const count = await pool.query(countQuery, values);
    res.json({ problems: problems, count: parseInt(count.rows[0].count, 10) });
  } 
  catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'An error occurred while fetching problems: ' + err.message});
  }
});

app.listen(port, () => {
  console.log(`server has started on port ${port}`);
});