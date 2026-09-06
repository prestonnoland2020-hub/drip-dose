// The Barista lives in the floating button now; this route just opens it.
import { open } from '../barista.js'
export async function render() { location.replace('#/brew'); setTimeout(open, 50) }
