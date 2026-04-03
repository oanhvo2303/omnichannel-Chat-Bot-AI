'use strict';

/**
 * Socket.IO Manager
 *
 * Singleton pattern: lưu trữ instance io để bất kỳ module nào
 * (controller, service) cũng có thể emit event mà không cần
 * truyền io qua argument chain.
 */

let ioInstance = null;

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => {
  if (!ioInstance) {
    console.warn('[SOCKET] IO chưa được khởi tạo.');
  }
  return ioInstance;
};

module.exports = { setIO, getIO };
