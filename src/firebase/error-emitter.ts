
import { EventEmitter } from 'events';

// A simple event emitter to broadcast errors globally on the client.
export const errorEmitter = new EventEmitter();
