import { describe, it, expect } from "vitest";
import {
  detectWindowElevationType,
  getWindowElevationTitle,
  generateWindowElevationSvg,
} from "../src/lib/window-elevation";

describe("Window Elevation Engine", () => {
  it("detects all window and door typologies correctly", () => {
    expect(detectWindowElevationType("2 track sliding window")).toBe("sliding2Track");
    expect(detectWindowElevationType("3 Track Slider with mesh")).toBe("sliding3Track");
    expect(detectWindowElevationType("Casement Openable Window")).toBe("casementWindow");
    expect(detectWindowElevationType("Bathroom Ventilator with Louvers")).toBe("ventilator");
    expect(detectWindowElevationType("Main Entrance Door Single Sash")).toBe("singleDoor");
    expect(detectWindowElevationType("French Double Door Balcony")).toBe("doubleDoor");
    expect(detectWindowElevationType("Fixed Glass Window")).toBe("fixedWindow");
  });

  it("returns human-readable title with item index", () => {
    expect(getWindowElevationTitle("sliding2Track", 1)).toBe("2-Track Sliding Window (Item 1)");
    expect(getWindowElevationTitle("casementWindow", 3)).toBe("Casement Window (Item 3)");
    expect(getWindowElevationTitle("doubleDoor", 2)).toBe("Double Door (Item 2)");
  });

  it("generates valid vector SVG with CAD dimension witness lines", () => {
    const svg = generateWindowElevationSvg({
      widthMm: 1200,
      heightMm: 1500,
      description: "2 Track Sliding Window with 5mm clear glass",
      itemIndex: 1,
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Outer Frame");
    expect(svg).toContain("Glazing Bead");
    expect(svg).toContain("1200 mm");
    expect(svg).toContain("1500 mm");
    expect(svg).toContain("Sliding 2-Track Sashes");
  });

  it("handles extreme aspect ratios without breaking", () => {
    const wideSvg = generateWindowElevationSvg({
      widthMm: 3000,
      heightMm: 600,
      description: "Ribbon ventilator",
    });
    expect(wideSvg).toContain("3000 mm");
    expect(wideSvg).toContain("600 mm");

    const tallSvg = generateWindowElevationSvg({
      widthMm: 600,
      heightMm: 2400,
      description: "Tall single door",
    });
    expect(tallSvg).toContain("600 mm");
    expect(tallSvg).toContain("2400 mm");
    expect(tallSvg).toContain("SWING");
  });
});
