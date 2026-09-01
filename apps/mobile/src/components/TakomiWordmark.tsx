import type { ColorValue } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedSvgText = withUniwind(SvgText);

/**
 * The "Takomi" brand mark, matching the desktop sidebar's TakomiWordmark SVG.
 * Uses the DM Sans font family already bundled in the mobile app.
 * Width derives from the viewBox aspect ratio.
 */
export function TakomiWordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const viewBoxWidth = 145;
  const viewBoxHeight = 42;
  const aspectRatio = viewBoxWidth / viewBoxHeight;
  return (
    <Svg
      accessibilityLabel="Takomi"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
    >
      <ThemedSvgText
        color={props.color}
        colorClassName={props.colorClassName}
        x="0"
        y="34"
        fontFamily="DMSans-Bold"
        fontWeight="800"
        fontSize="38"
        letterSpacing="-1.5"
        textLength="140"
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        Takomi
      </ThemedSvgText>
    </Svg>
  );
}
