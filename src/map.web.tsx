// Web version of the map pieces Jejak uses, on maplibre-gl, with the same props as the native components.
import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type LngLat = [number, number];
type Padding = { top?: number; bottom?: number; left?: number; right?: number };

export type CameraRef = {
  jumpTo(o: { center: LngLat; zoom?: number }): void;
  flyTo(o: { center: LngLat; zoom?: number; duration?: number }): void;
  fitBounds(b: [number, number, number, number], o?: { padding?: Padding; duration?: number }): void;
};

const MapContext = createContext<maplibregl.Map | null>(null);

export function Map({
  style,
  mapStyle,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  mapStyle: string;
  compass?: boolean;
  attribution?: boolean;
  logo?: boolean;
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: mapStyle,
      center: [101.69, 3.14],
      zoom: 9,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    setMap(m);
    return () => m.remove();
  }, [mapStyle]);
  return (
    <View style={style}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {map ? <MapContext.Provider value={map}>{children}</MapContext.Provider> : null}
    </View>
  );
}

export const Camera = forwardRef<CameraRef, { initialViewState?: { center: LngLat; zoom?: number } }>(function Camera(
  { initialViewState },
  ref,
) {
  const map = useContext(MapContext);
  useEffect(() => {
    if (map && initialViewState) map.jumpTo({ center: initialViewState.center, zoom: initialViewState.zoom });
  }, [map]);
  useImperativeHandle(
    ref,
    () => ({
      jumpTo: (o) => map?.jumpTo({ center: o.center, zoom: o.zoom }),
      flyTo: (o) => map?.flyTo({ center: o.center, zoom: o.zoom, duration: o.duration, essential: false }),
      fitBounds: (b, o) =>
        map?.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: { top: 0, bottom: 0, left: 0, right: 0, ...(o?.padding ?? {}) }, duration: o?.duration ?? 0, maxZoom: 15 },
        ),
    }),
    [map],
  );
  return null;
});

/** A React view pinned to a map position. */
export function Marker({
  lngLat,
  onPress,
  children,
}: {
  id?: string;
  lngLat: LngLat;
  onPress?: () => void;
  children: ReactElement | ReactNode;
}) {
  const map = useContext(MapContext);
  const [host] = useState(() => {
    const d = document.createElement('div');
    d.style.cursor = 'pointer';
    d.setAttribute('role', 'button');
    return d;
  });
  const marker = useRef<maplibregl.Marker | null>(null);
  const press = useRef(onPress);
  press.current = onPress;

  useEffect(() => {
    if (!map) return;
    const m = new maplibregl.Marker({ element: host, anchor: 'center' }).setLngLat(lngLat).addTo(map);
    const click = (e: MouseEvent) => {
      e.stopPropagation();
      press.current?.();
    };
    host.addEventListener('click', click);
    marker.current = m;
    return () => {
      host.removeEventListener('click', click);
      m.remove();
    };
  }, [map]);

  useEffect(() => {
    marker.current?.setLngLat(lngLat);
  }, [lngLat[0], lngLat[1]]);

  return createPortal(<>{children}</>, host);
}

export const ViewAnnotation = Marker;
