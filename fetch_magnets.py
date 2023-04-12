import requests
import json
import sys

def get_token():
    token_url = 'https://torrentapi.org/pubapi_v2.php?get_token=get_token&app_id=lol'
    try:
        response = requests.get(token_url, headers={'User-Agent': 'Mozilla/5.0'})
        if response.status_code == 200:
            token_data = json.loads(response.text)
            return token_data['token']
    except Exception as e:
        print("Error:", e)
    return None


token = get_token()
query = sys.argv[1] if len(sys.argv) > 1 else ''
if token:
    rarbg_link = f'https://torrentapi.org/pubapi_v2.php?mode=search&search_string={query}&token={token}&format=json_extended&app_id=lol'
    request = None
    try:
        request = requests.get(rarbg_link, headers={'User-Agent': 'Mozilla/5.0'})
    except Exception as e:
        print("ERROR:", e)

    if request:
        response_data = json.loads(request.text)
        
        if 'error' in response_data:
            print(f"Error {response_data['error_code']}: {response_data['error']}")
        elif 'torrent_results' in response_data:
            torrent_results = response_data['torrent_results']
            print(json.dumps(torrent_results)) # Print the results as JSON
        else:
            print("No results found.")
    else:
        print("Unable to fetch results.")
else:
    print("Unable to obtain token.")
