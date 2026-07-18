import { io } from 'socket.io-client';

//creates a single shared socket connection to the server
//imported wherever socket communication is needed
const socket = io('http://localhost:3001');
export default socket;