import requests

class Api:
    def __init__(self, base_url):
        self.base_url = base_url
    
    def get_tables(self):
        response = requests.get(f"{self.base_url}/api/tables/")
        return response.json()
    
    def assist(self, no_control):
        response = requests.post(f"{self.base_url}/students/check/", json={"no_control": no_control})
        return response.json()
    
    def upload_student(self, student_data):
        response = requests.post(f"{self.base_url}/students/upload_data/", json=student_data)
        return response.json()
        