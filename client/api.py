import requests

class Api:
    def __init__(self, base_url):
        self.base_url = base_url
    
    def get_tables(self):
        response = requests.get(f"{self.base_url}/tables/")
        return response.json()
    
    def assist(self):
        pass
        