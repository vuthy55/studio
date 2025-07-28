
"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Send } from 'lucide-react';
import { submitFeedback } from '@/actions/feedback';
import Image from 'next/image';

const feedbackSchema = z.object({
  category: z.string().min(1, "Please select a category."),
  comment: z.string().min(10, "Please provide at least 10 characters of feedback.").max(5000, "Comment cannot exceed 5000 characters."),
  screenshot: z.any().optional()
});

export default function FeedbackPage() {
  const { user, userProfile } = useUserData();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const form = useForm<z.infer<typeof feedbackSchema>>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      category: "",
      comment: "",
      screenshot: undefined,
    },
  });

  if (!user || !userProfile) {
    router.push('/login');
    return null;
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({
          variant: 'destructive',
          title: 'File Too Large',
          description: 'Please upload a screenshot under 2MB.',
        });
        form.setValue('screenshot', null);
        setScreenshotPreview(null);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      form.setValue('screenshot', file);
    }
  };

  const onSubmit = async (values: z.infer<typeof feedbackSchema>) => {
    setIsSubmitting(true);
    try {
        const result = await submitFeedback(values, {
            uid: user.uid,
            email: user.email!,
            name: user.displayName || user.email!,
        });

        if (result.success) {
            toast({
                title: 'Feedback Sent!',
                description: 'Thank you for your input. We have received your submission.',
            });
            router.push('/synchub');
        } else {
            throw new Error(result.error || 'An unknown error occurred.');
        }

    } catch (error: any) {
        console.error("Feedback submission error:", error);
        toast({
            variant: 'destructive',
            title: 'Submission Failed',
            description: error.message,
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <MainHeader title="Submit Feedback" description="Help us improve VibeSync for everyone." />
      <Card>
        <CardHeader>
          <CardTitle>Feedback Form</CardTitle>
          <CardDescription>
            Your feedback is confidential and sent directly to the VibeSync admin team. We appreciate you taking the time to help us!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a feedback category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Bug Report">Bug Report</SelectItem>
                        <SelectItem value="Feature Request">Feature Request</SelectItem>
                        <SelectItem value="Translation Issue">Translation Issue</SelectItem>
                        <SelectItem value="UI/UX Feedback">UI/UX Feedback</SelectItem>
                        <SelectItem value="General Comment">General Comment</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Feedback</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please be as detailed as possible. If reporting a bug, what steps did you take?"
                        className="resize-y min-h-[150px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="screenshot"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attach Screenshot (Optional, 2MB Max)</FormLabel>
                    <FormControl>
                      <Input type="file" accept="image/png, image/jpeg, image/gif" onChange={handleFileChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
                {screenshotPreview && (
                    <div className="mt-4">
                        <Label>Screenshot Preview</Label>
                        <div className="mt-2 relative w-full max-w-sm h-64 border rounded-md overflow-hidden">
                           <Image src={screenshotPreview} alt="Screenshot preview" layout="fill" objectFit="contain" />
                        </div>
                    </div>
                )}
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Submit Feedback
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
