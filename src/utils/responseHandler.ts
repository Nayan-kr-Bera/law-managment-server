function ResponseHandler(status: number, message: string, data?: object | null) {
    return {
        status,
        message,
        data,
    };
}

export default ResponseHandler;
