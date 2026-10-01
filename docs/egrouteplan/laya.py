from laya import Router

def main():
    print('demo de clasificación de cerveza')
    router = Router()
    text = 'quiero una cerveza rubia y refrescante'
    
    # Asigna la consulta o el resultado del router correctamente:
    # (Usa el método provisto por la librería de Laya, por ejemplo .route() o .process())
    question = router.route(text) 
    print(question)

if __name__ == '__main__':
    main()
    