#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;

vec4 red = vec4(1.0, 0.0, 0.0, 1.0);
vec4 green = vec4(0.0, 1.0, 0.0, 1.0);
vec4 blue = vec4(0.0, 0.0, 1.0, 1.0);

void main() {
    gl_FragColor = mix(mix(red, green, abs(sin(u_time))), blue, abs(cos(u_time)));
}