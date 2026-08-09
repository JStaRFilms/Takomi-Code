# t3code

Type: Cloned Repository
Source: https://github.com/pingdotgg/t3code.git
Date: 2026-07-22

I ened the ability to continue an already exiiting pi thread and then the able to refresh already existing session. maybe I descide to runt he terminal and close t chat then later Ic aome back i can refresh.

then also I wan tot be able to have access to all my slash commands from pi in Takomi GUI

make takomi an option in the side menue

I think when the sub-agents are running, I should be able to see what model they used.
They're not, so we need to work on the subagent preview. Right now, when the subagent itself is running and I click on preview, it's kind of fine. I can see the two calls coming in, although they get truncated, but I guess that's fine.

Where the issue comes is when I go to the list of subagents that are done and I'm clicking on them one by one. I cannot now see the final message the subagent gave. All that gets given to me is more like just an overview of a bunch of other things that happened.
/I didn't even really get to see the prompt that was sent to the sub-agent, because at the bottom where it's meant to show that prompt, it gets truncated. It's kind of annoying. I have to now come up with i don't know. But the only way I can actually see what the sub-agent properly did, apart from the logs that I can see here (that get truncated), is that I go to the main thread and click on "Open in Inspector."

When I click on "Open in Inspector," it then finally shows me the last message that the sub-agent sent, which I don't think is really good. It's not even formatted (I forgot about the formatting part). It's just really annoying that I have to go through that stress before I can see the final output or the prompt.

Then I think we need to find a way to better demarcate this right-side panel. I know we have the board. Things that can show there include the board, to-do list, sub-agents, right? I'm not sure what else can show there. And a bunch of other custom tool calls that Takumi has, I guess.

So now, I think those things should kind of be "pinned," or at least if there's nothing, should be grayed out, and they should have a fixed position there that can obviously expand, and I should be able to collapse it or something like that. Do you understand? Because it's kind of annoying where if I want to see the to-do list now, I have to go to the panel, to the main chat area, then tap on a previous to-do, and then click on "open in inspector." Then the to-do will now open under "context details," right?

Even that to-do list stuff doesn't have enough information. The information is kind of reasonable, but I think I should be able to tap on each of the to-dos and see in the full prompt, the full thing that the agent described. Sometimes it gets truncated, if I'm not mistaken. I might be wrong, I'm not really sure, but I think it does get truncated sometimes.

I should maybe have a very simple sort. No, I don't think I should be sorting it. There's no point of sorting it, it's fine. Those are just some things I noticed that I think need work to make this feel much more polished.

Then also, I don't know if it's a T3 chat thing, but it's kind of annoying that when it's showing two calls in the main text area and I tap on them, it's really truncated. What is now the point if I can't actually see the full thing? That's high-key annoying.

It will be much more reasonable if, maybe, when I tap on it once, it shows the truncated version. If I tap on it again, it shows the full version. It's just kind of annoying, it's really, really, really annoying.

Then I don't know what other Takomi-specific tools are left to be translated into proper native T3 code UI elements. I'm not really sure, but I think those two we should look into that.
