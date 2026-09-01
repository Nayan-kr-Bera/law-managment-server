const generateRandomDigit = (startWith: number, digit: number) => {
    return Math.floor(startWith + Math.random() * digit);
};

export default generateRandomDigit;
