import requests
import json


class Api:
    def __init__(self, base_url, jwt_token):
        self.base_url = base_url
        self.jwt_token = jwt_token
        self.headers = {
            "Authorization": f"token {self.jwt_token}",
            "Content-Type": "application/json"
        }

    def get_tables(self):
        response = requests.get(f"{self.base_url}/api/tables/", headers=self.headers)
        try:
            return response.json()
        except Exception:
            return {'text': response.text, 'status_code': response.status_code}

    def assist(self, no_control):
        response = requests.post(
            f"{self.base_url}/students/check/", json={"no_control": no_control}, headers=self.headers)
        try:
            return response.json()
        except Exception:
            return {'text': response.text, 'status_code': response.status_code}

    def upload_student(self, student_data):
        response = requests.post(
            f"{self.base_url}/students/upload_data/", json=student_data, headers=self.headers)
        try:
            return response.json(), response.status_code
        except Exception:
            return {'text': response.text}, response.status_code
