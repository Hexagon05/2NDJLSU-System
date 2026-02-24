"use client";


interface MapProps {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  height?: string;
}

export function OpenStreetMap({
  latitude = 9.747732,
  longitude = 118.7724956,
  zoom = 15,
  height = "h-80",
}: MapProps) {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.5},${latitude - 0.5},${longitude + 0.5},${latitude + 0.5}&layer=mapnik&marker=${latitude},${longitude}`;

  return (
    <div className={`rounded-lg overflow-hidden border-2 border-dashed border-blue-300 ${height}`}>
      <iframe
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        marginHeight={0}
        marginWidth={0}
        src={mapUrl}
        style={{ border: 0 }}
      ></iframe>
      <br />
      <small>
        <a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=${zoom}&layers=M`}
          style={{
            color: "#0000FF",
            textAlign: "left",
            padding: "8px",
            display: "inline-block"
          }}
        >
          View Full Map
        </a>
      </small>
    </div>
  );
}
