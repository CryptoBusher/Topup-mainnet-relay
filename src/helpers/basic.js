export const sleep = (sec) => {
	return new Promise(resolve => setTimeout(resolve, sec * 1000));
};


export const randInt = (min, max) => {
	return Math.floor(Math.random() * (max - min + 1) + min);
};


export const randFloat = (min, max) => {
	return Math.random() * (max - min) + min;
};


export const shuffleArray = (array) => {
	return array.sort(() => Math.random() - 0.5);
};


export const randomChoice = (arr) => {
	const randomIndex = Math.floor(Math.random() * arr.length);
	return arr[randomIndex];
};


export const randFloatWithDec = (min, max, minDec, maxDec) => {
	const randomBase = Math.random() * (max - min) + min;
	const decAmount = randInt(minDec, maxDec);
	return parseFloat(randomBase.toFixed(decAmount));
};


export const roundToAppropriateDecimalPlace = (value, minDec, maxDec) => {
	const decAmount = randInt(minDec, maxDec);
	const decimalPlaces = Math.max(0, -Math.floor(Math.log10(Math.abs(value))) + decAmount);
	return value.toFixed(decimalPlaces);
};
