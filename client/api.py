import requests
import json


class Api:
    def __init__(self, base_url, jwt_token):
        self.base_url = base_url
        self.jwt_token = jwt_token
        self.headers = {
            "Authorization": f"Token {self.jwt_token}",
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
        
    def upload_personal(self, personal_data):
        response = requests.post(
            f"{self.base_url}/personal/upload_data/", json=personal_data, headers=self.headers)
        try:
            return response.json(), response.status_code
        except Exception:
            return {'text': response.text}, response.status_code
        
class ApiClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.sesion = requests.Session()
        
    def login(self, email, password):
        response = self.sesion.post(f"{self.base_url}/api/user/login/", json={"email": email, "password": password})
        # If server sets HTTPOnly cookie `auth_token`, it will be stored in the session cookies
        if response.status_code == 200:
            # prefer to check cookie presence (login endpoint sets cookie and returns user)
            if self.sesion.cookies.get('auth_token'):
                return True
            try:
                data = response.json()
                return 'user' in data
            except Exception:
                return False
        return False
        
    def tabview(self, table_id, table_tab):
        # Use the session so cookies (HttpOnly auth_token) are sent automatically
        response = self.sesion.get(f"{self.base_url}/api/tables/tabview/{table_id}/{table_tab}/")
        try:
            return response.json()
        except Exception:
            return {'text': response.text, 'status_code': response.status_code}
        
    def get_tables(self):
        response = self.sesion.get(f"{self.base_url}/api/tables/")
        try:
            return response.json()
        except Exception:
            return {'text': response.text, 'status_code': response.status_code}
        
    def get_tabs(self, table_id):
        response = self.sesion.get(f"{self.base_url}/api/tables/{table_id}/tabs/")
        try:
            return response.json()
        except Exception:
            return {'text': response.text, 'status_code': response.status_code}
