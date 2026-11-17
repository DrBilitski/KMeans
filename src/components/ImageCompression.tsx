import { Panel } from './ui';

/** Placeholder for use case 2 (details to come). */
export function ImageCompressionStub() {
  return (
    <main className="stub">
      <Panel title="Image Compression by Limiting Colors" icon="🖼️">
        <div className="stub-body">
          <div className="stub-badge">COMING SOON</div>
          <p>
            Every pixel is a point in color space (red, green, blue). K-means groups similar colors; each <b>centroid is one palette color</b>, and every pixel is repainted with its centroid’s
            color. <b>k = the number of colors</b> left in the image.
          </p>
          <ul>
            <li>Small k: big savings, visible color banding.</li>
            <li>Large k: closer to the original, less compression.</li>
            <li>The same steps as in the Explorer: assign each pixel to the nearest color, move each color to the mean of its pixels, repeat.</li>
          </ul>
          <p className="muted">This tab is a placeholder until the details for this use case are provided.</p>
        </div>
      </Panel>
    </main>
  );
}
