# demo.tape — renders ../docs/demo.gif with VHS (https://github.com/charmbracelet/vhs)
#
#   brew install vhs        # pulls ttyd + ffmpeg
#   cd demo && vhs demo.tape
#
# Edit demo.sh to change what the demo shows; this tape just runs it and records.

Output ../docs/demo.gif

Require echo

Set Shell "bash"
Set FontSize 18
Set Width 1080
Set Height 720
Set Padding 24
Set Margin 0
Set TypingSpeed 18ms
Set Framerate 24

# Near-black background, vivid palette (less blue, more color).
Set Theme { "name": "OvernightBlack", "background": "#070708", "foreground": "#eaeaea", "selection": "#2a2d3a", "cursor": "#ffcb6b", "black": "#15151a", "red": "#ff5555", "green": "#4df08a", "yellow": "#ffcb6b", "blue": "#7aa2f7", "magenta": "#ff79c6", "cyan": "#56e7e0", "white": "#eaeaea", "brightBlack": "#6c7086", "brightRed": "#ff6e6e", "brightGreen": "#69ff94", "brightYellow": "#ffe28a", "brightBlue": "#9fc0ff", "brightMagenta": "#ff92df", "brightCyan": "#7af5ee", "brightWhite": "#ffffff" }

# Clean prompt, no recording of setup
Hide
Type 'export PS1="$ "' Enter
Type "clear" Enter
Show

Type "./demo.sh" Sleep 400ms Enter

# demo.sh paces itself with internal sleeps (~13s); wait it out, then hold the last frame.
Sleep 15s
