import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsService } from '../../../core/services/google-maps.service';
import { Proveedor } from '../../models/proveedor.model';

declare const google: any;

// Estilo limpio tipo Uber — sin azules, sin POIs, tierra/gris suave
const MAP_STYLE = [
  { featureType: 'all',        elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },
  { featureType: 'poi',                                            stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',                                        stylers: [{ visibility: 'off' }] },

  // Tierra / urbano
  { featureType: 'landscape',        elementType: 'geometry', stylers: [{ color: '#f2f1ed' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#ebe9e4' }] },

  // Calles
  { featureType: 'road',          elementType: 'geometry.fill',   stylers: [{ color: '#ffffff' }] },
  { featureType: 'road',          elementType: 'geometry.stroke',  stylers: [{ color: '#e4e4e0' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill',   stylers: [{ color: '#f7f6f2' }] },
  { featureType: 'road.highway',  elementType: 'geometry.fill',   stylers: [{ color: '#edebe5' }] },
  { featureType: 'road.highway',  elementType: 'geometry.stroke',  stylers: [{ color: '#d8d5cc' }] },

  // Agua — azul apagado
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d8e8' }] },

  // Labels — TODOS grises, sin azul
  { elementType: 'labels.text.fill',   stylers: [{ color: '#a0a09a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f4f0' }, { weight: 2 }] },

  { featureType: 'road',                    elementType: 'labels.text.fill', stylers: [{ color: '#c4c2bb' }] },
  { featureType: 'road.highway',            elementType: 'labels.text.fill', stylers: [{ color: '#b8b4a8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#808078' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#aaa9a2' }] },
  { featureType: 'water',                   elementType: 'labels.text.fill', stylers: [{ color: '#a8bcc8' }] },
];

const AVATAR_COLORS = [
  '#4f46e5','#0891b2','#059669','#d97706',
  '#dc2626','#7c3aed','#db2777','#0369a1',
];

@Component({
  selector: 'app-providers-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './providers-map.component.html',
  styleUrl: './providers-map.component.scss',
})
export class ProvidersMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  @Input() proveedores: Proveedor[] = [];

  private gmaps  = inject(GoogleMapsService);
  private map: any;
  private markers: any[] = [];
  private infoWindow: any;
  private mapReady = false;

  get conZona(): Proveedor[] {
    return this.proveedores.filter(p => p.zona?.lat != null);
  }

  get sinZona(): number {
    return this.proveedores.length - this.conZona.length;
  }

  async ngAfterViewInit() {
    await this.gmaps.load();
    this.initMap();
    this.mapReady = true;
    this.renderMarkers();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['proveedores'] && this.mapReady) {
      this.renderMarkers();
    }
  }

  private initMap() {
    this.map = new google.maps.Map(this.mapEl.nativeElement, {
      center:            { lat: -34.6037, lng: -58.3816 },
      zoom:              10,
      styles:            MAP_STYLE,
      disableDefaultUI:  true,       // quita todos los controles por defecto
      gestureHandling:   'greedy',   // scroll sin Ctrl
      clickableIcons:    false,
    });

    this.infoWindow = new google.maps.InfoWindow({ maxWidth: 280, disableAutoPan: false });
    this.map.addListener('click', () => this.infoWindow.close());
  }

  private renderMarkers() {
    this.markers.forEach(m => { google.maps.event.clearInstanceListeners(m); m.setMap(null); });
    this.markers = [];
    this.infoWindow?.close();

    const withZona = this.conZona;
    if (!withZona.length) return;

    const bounds = new google.maps.LatLngBounds();

    withZona.forEach(p => {
      const pos     = { lat: p.zona!.lat, lng: p.zona!.lng };
      const color   = this.avatarColor(p.nombre);
      const initial = p.nombre[0]?.toUpperCase() ?? '?';

      const marker = new google.maps.Marker({
        map:      this.map,
        position: pos,
        title:    p.nombre,
        icon:     this.buildIcon(color, initial),
        cursor:   'pointer',
      });

      marker.addListener('click', () => {
        this.infoWindow.setContent(this.buildCard(p));
        this.infoWindow.open({ map: this.map, anchor: marker });
      });

      this.markers.push(marker);
      bounds.extend(pos);
    });

    if (withZona.length === 1) {
      this.map.setCenter(bounds.getCenter());
      this.map.setZoom(14);
    } else {
      this.map.fitBounds(bounds, { top: 80, right: 60, bottom: 60, left: 60 });
    }
  }

  /** Marcador circular limpio */
  private buildIcon(color: string, letter: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46">
      <defs>
        <filter id="d" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.18"/>
        </filter>
      </defs>
      <circle cx="23" cy="23" r="20" fill="${color}" filter="url(#d)"/>
      <circle cx="23" cy="23" r="20" fill="none" stroke="#fff" stroke-width="2.5"/>
      <text x="23" y="28" font-family="-apple-system,BlinkMacSystemFont,sans-serif"
            font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text>
    </svg>`.trim();

    return {
      url:        'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(46, 46),
      anchor:     new google.maps.Point(23, 23),
    };
  }

  /** Card dentro del InfoWindow */
  private buildCard(p: Proveedor): string {
    const color   = this.avatarColor(p.nombre);
    const initials = p.nombre.trim().split(/\s+/).length >= 2
      ? (p.nombre[0] + p.nombre.trim().split(/\s+/)[1][0]).toUpperCase()
      : p.nombre.substring(0, 2).toUpperCase();
    const waUrl   = p.telefono ? `https://wa.me/${p.telefono.replace(/\D/g, '')}` : '';
    const stars   = p.rating ? Array.from({ length: 5 }, (_, i) =>
      `<span style="color:${i < p.rating! ? '#f59e0b' : '#e0e0e0'}">★</span>`).join('') : '';
    const specs   = p.subrubros.slice(0, 3).map(s => s.nombre).join('  ·  ');

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                  padding:0;min-width:220px;max-width:270px">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:38px;height:38px;border-radius:50%;background:${color};
                      display:flex;align-items:center;justify-content:center;
                      flex-shrink:0;font-size:14px;font-weight:700;color:#fff">
            ${initials}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.9rem;font-weight:700;color:#111;
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${p.nombre}
            </div>
            ${p.responsable
              ? `<div style="font-size:.72rem;color:#999;margin-top:1px">👤 ${p.responsable}</div>`
              : ''}
          </div>
        </div>
        <!-- Stars -->
        ${stars ? `<div style="margin-bottom:6px;font-size:.85rem">${stars}</div>` : ''}
        <!-- Especialidades -->
        ${specs ? `<div style="font-size:.72rem;color:#bbb;margin-bottom:10px;line-height:1.5">${specs}</div>` : ''}
        <!-- Zona -->
        ${p.zona?.address
          ? `<div style="font-size:.72rem;color:#a0a09a;margin-bottom:10px;
                         display:flex;align-items:flex-start;gap:4px">
               <span>📍</span>
               <span style="line-height:1.4">${p.zona.address}</span>
             </div>` : ''}
        <!-- Acciones -->
        <div style="display:flex;gap:6px">
          ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener"
            style="flex:1;text-align:center;font-size:.75rem;font-weight:600;color:#fff;
                   background:#25d366;padding:7px 10px;border-radius:8px;
                   text-decoration:none">💬 WhatsApp</a>` : ''}
          ${p.email ? `<a href="mailto:${p.email}"
            style="flex:1;text-align:center;font-size:.75rem;font-weight:600;color:#fff;
                   background:#3b3b3b;padding:7px 10px;border-radius:8px;
                   text-decoration:none">✉ Email</a>` : ''}
        </div>
      </div>`;
  }

  private avatarColor(nombre: string): string {
    return AVATAR_COLORS[nombre.charCodeAt(0) % AVATAR_COLORS.length];
  }

  ngOnDestroy() {
    this.markers.forEach(m => { google.maps.event.clearInstanceListeners(m); m.setMap(null); });
    this.markers = [];
  }
}
