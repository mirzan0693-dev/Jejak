import { registerRootComponent } from 'expo';
import './src/lib/location'; // registers the background location task at startup
import App from './App';

registerRootComponent(App);
