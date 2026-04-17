'''
Cliente Secundario de la api, para endpoinds de acceso
'''

from api import Api

def main():
    api = Api("http://127.0.0.1:8000/api")
    tables = api.get_tables()
    print(tables)
    
if __name__ == "__main__":
    main()