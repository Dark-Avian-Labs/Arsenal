import 'express';

declare global {
  namespace Express {
    interface Locals {
      cspNonce?: string;
    }
  }
}
