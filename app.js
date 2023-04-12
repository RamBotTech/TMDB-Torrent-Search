//app.js

require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();

const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.render('index', { results: null });
});

app.post('/', async (req, res) => {
  const query = req.body.query;

  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${process.env.TMDB_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  const results = data.results.filter(result => result.media_type === 'movie' || result.media_type === 'tv');

  res.render('index', { results });
});

app.get('/details/:id', async (req, res) => {
    const id = req.params.id;
  
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.TMDB_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
  
    res.json({ movie: data }); // Change this line
  });
  

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
// Add this new route to handle dynamic search queries
app.get('/search', async (req, res) => {
    const query = req.query.query;
  
    if (!query) {
      return res.json([]);
    }
  
    const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${process.env.TMDB_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const results = data.results.filter(result => result.media_type === 'movie' || result.media_type === 'tv');
  
    res.json(results);
  });
  // Add a new route to fetch the TV show's details, including its seasons
  app.get('/tv/:id', async (req, res) => {
    const id = req.params.id;
  
    const detailsUrl = `https://api.themoviedb.org/3/tv/${id}?api_key=${process.env.TMDB_API_KEY}&append_to_response=seasons`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();
  
    res.json({ details: detailsData, seasons: detailsData.seasons });
  });
  app.post('/magnet_links', async (req, res) => {
    const query = req.body.query;

    const pythonProcess = spawn('python3', ['fetch_magnets.py', query]);
    let pythonOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line) => {
            if (!line.startsWith('API response:')) {
                pythonOutput += line;
            }
        });
    });
    

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            res.status(500).json({ error: 'An error occurred while fetching magnet links.' });
            return;
        }

        // Parse the JSON output from the Python script
        const torrentResults = JSON.parse(pythonOutput);

        // Return the torrent results
        res.json({ magnet_links: torrentResults });
    });
});
// Add a new route to handle Bitport OAuth
app.get('/authorize_bitport', (req, res) => {
  const authorizeUrl = `https://api.bitport.io/v2/oauth2/authorize?response_type=code&client_id=${process.env.BITPORT_APP_ID}`;
  res.redirect(authorizeUrl);
});

app.get('/bitport_callback', async (req, res) => {
  const code = req.query.code;
  const accessToken = await exchangeCodeForAccessToken(code);
  
  // Save the access token to a file
  saveAccessToken(accessToken);
  
  res.send('Bitport access token received');
});


async function exchangeCodeForAccessToken(code) {
  const url = 'https://api.bitport.io/v2/oauth2/access-token';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=authorization_code&client_id=${process.env.BITPORT_APP_ID}&client_secret=${process.env.BITPORT_APP_SECRET}&code=${code}`,
  });

  const data = await response.json();
  console.log('Access token data:', data); // Added console.log for suggestion 2
  return data.access_token;
}


// Add this function to read the access token from a file
function getAccessToken() {
  const filePath = path.resolve(__dirname, 'access_token.json');

  if (!fs.existsSync(filePath)) {
    console.error('access_token.json does not exist. Make sure to authorize with Bitport first.');
    return ''; // Return an empty string or handle the error appropriately
  }

  const tokenDataString = fs.readFileSync(filePath, 'utf-8');

  if (!tokenDataString) {
    console.error('access_token.json is empty. Make sure to authorize with Bitport first.');
    return '';
  }

  const tokenData = JSON.parse(tokenDataString);
  return tokenData.access_token;
}


app.post('/download_to_bitport', async (req, res) => {
  const magnetLink = req.body.magnetLink;

  // Get the Bitport access token from the file
  const accessToken = getAccessToken();

  if (!accessToken) {
    res.status(500).json({ error: 'No Bitport access token available. Please authorize with Bitport first.' });
    return;
  }

  // Log the magnetLink value for debugging
  console.log('Magnet link:', magnetLink);

  // Call the Bitport API to add a new transfer
  const url = 'https://api.bitport.io/v2/transfers';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: `torrent=${encodeURIComponent(magnetLink)}`,
    redirect: 'manual', // Change the redirect mode to manual
  });

  // If the response status is 201 (Created), it's a success
  if (response.status === 201) {
    const location = response.headers.get('location');
    console.log('Bitport API created:', location);

    res.json({ message: 'Torrent created successfully.', location });
  } else if (response.status >= 300 && response.status < 400) {
    // Handle the 3xx redirect case
    const redirectUrl = response.headers.get('location');
    console.log('Following Bitport API redirect:', redirectUrl);

    // Fetch the JSON response from the redirected URL
    const redirectResponse = await fetch(redirectUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const data = await redirectResponse.json();
    res.json(data);
  } else {
    // Log the error details
    console.error('Bitport API error:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    res.status(500).json({ error: 'An error occurred while processing the Bitport API response.' });
  }
});









function saveAccessToken(accessToken) {
  console.log('Saving access token:', accessToken); // Added console.log for suggestion 3
  const tokenData = {
    access_token: accessToken,
  };

  const filePath = path.resolve(__dirname, 'access_token.json');
  fs.writeFileSync(filePath, JSON.stringify(tokenData), 'utf-8');
}




  
 
  